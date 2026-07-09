import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generate } from "./ai.service";
import { recordAiUsage } from "./guard";
import {
  getTenantSnapshot,
  getTenantSnapshotForTerm,
  type TenantSnapshot,
  type HistoricalSnapshot,
} from "@/repositories/tenant-snapshot.repository";
import { HttpError, notFound, badRequest } from "@/lib/http/errors";
import { buildChatAnonymizer, anonymizeForPrompt, deanonymizeReply } from "./chat-anonymize";

/**
 * Chat de perguntas sobre os dados do tenant (Etapa 3) — agora com
 * conversas nomeadas de verdade (sidebar estilo ChatGPT), não uma lista
 * corrida só por (tenant, membership). Ver migration
 * `20260707042841_ai_chat_conversations` pro backfill das conversas que já
 * existiam antes desse conceito existir.
 *
 * A IA NÃO tem acesso ao banco — `getTenantSnapshot()` é a única fonte de
 * dado, pré-buscada e já filtrada+asserida por tenant (ver
 * repositories/tenant-snapshot.repository.ts). O prompt só contém esse
 * snapshot + as últimas 5 mensagens DA CONVERSA ATUAL, nunca uma query livre.
 */

const HISTORY_LIMIT = 5;
const TITLE_MAX_LENGTH = 60;

/**
 * Escopo do chat — trava reintroduzida nesta rodada (rodada anterior tinha
 * removido a recusa explícita a pedido do usuário; esta rodada pediu
 * explicitamente pra confirmar que ela "ainda recusa", então voltou a
 * ficar ativa). Antes reforçada via marcador de texto padronizado
 * (`{"erro":"FORA_DE_ESCOPO"}`) porque a geração era `generateText` (saída
 * livre); agora que virou `generateObject` (schema abaixo, pra também
 * trazer `suggestions`), o campo `refused: boolean` faz o mesmo papel de
 * forma mais robusta — mesmo padrão já usado em essay-grading.service.ts.
 *
 * O que já existia e PERMANECE, por ser proteção de integridade de dado,
 * não de escopo de assunto: nunca inventar turma/aluno/nota/frequência que
 * não esteja em `getTenantSnapshot()`.
 */
const SYSTEM_PROMPT = [
  "Você é um assistente pedagógico para professores e coordenadores de uma escola, dentro do produto AvaliaSmart.",
  "Responda em português do Brasil, de forma direta e prática.",
  "Você tem duas fontes de conhecimento: (1) os dados do tenant fornecidos abaixo (turmas, alunos, notas, frequência) e (2) seu conhecimento geral, LIMITADO a assuntos pedagógicos/educacionais (BNCC, didática, gestão de sala de aula, avaliação, desenvolvimento infantil, etc).",
  "Para (1): baseie-se SOMENTE nos dados fornecidos — nunca invente turma, aluno, nota ou frequência que não esteja lá; se a pergunta não puder ser respondida com os dados disponíveis, diga isso claramente em vez de supor.",
  "Para (2): responda normalmente questões pedagógicas/educacionais gerais. Para códigos oficiais da BNCC (ex: \"EF06CI03\"), descreva a habilidade em linguagem natural em vez de citar um código — nunca invente um código alfanumérico que você não tenha certeza de estar correto.",
  "Se a pergunta for CLARAMENTE fora do escopo pedagógico/escolar (ex: receitas, assuntos pessoais, entretenimento, qualquer coisa sem relação com educação), defina `refused: true` e deixe `reply`/`suggestions` vazios — NUNCA responda a pergunta fora de escopo.",
  "Se `refused: false`, preencha `reply` normalmente e, em `suggestions`, sugira de 2 a 3 próximas perguntas curtas (poucas palavras cada) que o professor plausivelmente faria em seguida, relacionadas à sua pergunta e à resposta — nunca genéricas demais, nunca repetindo a pergunta atual.",
].join(" ");

const chatResponseSchema = z.object({
  refused: z.boolean().describe("true se a pergunta for claramente fora do escopo pedagógico/escolar."),
  reply: z.string().optional().describe("Resposta ao professor — só quando refused=false."),
  suggestions: z
    .array(z.string())
    .optional()
    .describe("2 a 3 sugestões curtas de próxima pergunta, relacionadas à resposta — só quando refused=false."),
});

function formatSnapshot(snapshot: TenantSnapshot): string {
  const classLines = snapshot.classes
    .map((c) => {
      const subjLines = c.subjectAverages
        .map((s) => {
          const cur = s.average !== null ? s.average.toFixed(1) : "sem notas";
          const prev = s.previousAverage !== null ? ` (período anterior: ${s.previousAverage.toFixed(1)})` : "";
          return `    - ${s.subjectName}: média ${cur}${prev}`;
        })
        .join("\n");
      return `- Turma ${c.className} (${c.studentCount} alunos, frequência ${c.attendancePct.toFixed(0)}%):\n${subjLines}`;
    })
    .join("\n");

  const flagLines = snapshot.studentsNeedingAttention
    .map((f) => `- ${f.studentName} (${f.className}): ${f.reason}`)
    .join("\n");

  return [
    `Escola: ${snapshot.tenantName}`,
    `Período atual: ${snapshot.termName}`,
    "",
    "Turmas:",
    classLines || "(nenhuma turma cadastrada)",
    "",
    "Alunos que precisam de atenção:",
    flagLines || "(nenhum aluno sinalizado no momento)",
  ].join("\n");
}

function formatHistoricalSnapshot(snapshot: HistoricalSnapshot): string {
  const classLines = snapshot.classes
    .map((c) => {
      const subjLines = c.subjectAverages
        .map((s) => `    - ${s.subjectName}: média ${s.average !== null ? s.average.toFixed(1) : "sem notas"}`)
        .join("\n");
      return `- Turma ${c.className} (frequência ${c.attendancePct.toFixed(0)}%):\n${subjLines}`;
    })
    .join("\n");

  const flagLines = snapshot.studentsNeedingAttention.map((f) => `- ${f.studentName} (${f.className}): ${f.reason}`).join("\n");

  return [
    `Dados históricos do período "${snapshot.termName}" (buscados sob demanda porque a pergunta parece ser comparativa/histórica):`,
    classLines || "(nenhuma turma com dado nesse período)",
    "",
    "Alunos que precisavam de atenção nesse período:",
    flagLines || "(nenhum sinalizado nesse período)",
  ].join("\n");
}

/**
 * Detecção BARATA (regex, sem chamada de IA) de pergunta histórica/
 * comparativa — "como estava no bimestre passado?", "e no 2º Bimestre?".
 * Deliberadamente simples: cobre o caso pedido (período RELATIVO — "passado"/
 * "anterior") e o caso de um nome de período EXPLÍCITO (bate contra os
 * nomes reais de Term do tenant, ex: "1º Bimestre"). Não tenta entender
 * frases mais elaboradas — o objetivo é ser barato o bastante pra rodar em
 * toda mensagem sem custar tokens de IA, não substituir um classificador.
 */
const RELATIVE_PAST_PATTERN = /\b(passad|anterior)/i;

async function resolveHistoricalTermId(
  tenantId: string,
  message: string,
  currentTermId: string
): Promise<string | null> {
  const academicYear = await prisma.academicYear.findFirst({ where: { tenantId, isActive: true } });
  if (!academicYear) return null;

  const terms = await prisma.term.findMany({ where: { academicYearId: academicYear.id }, orderBy: { order: "asc" } });
  const currentTerm = terms.find((t) => t.id === currentTermId);
  if (!currentTerm) return null;

  // Nome explícito de período mencionado na pergunta (ex: "1º Bimestre")
  // é checado PRIMEIRO e independente de "passado"/"anterior" aparecer —
  // cobre "e no 1º Bimestre, como estava?" (sem essa palavra) quando o
  // período atual já é o 4º. Só cai pro padrão relativo abaixo se não
  // achar nenhum nome explícito na pergunta.
  const normalizedMessage = message.toLowerCase();
  const explicitMatch = terms.find((t) => t.id !== currentTermId && normalizedMessage.includes(t.name.toLowerCase()));
  if (explicitMatch) return explicitMatch.id;

  if (!RELATIVE_PAST_PATTERN.test(message)) return null;

  // "passado"/"anterior" genérico (sem nome explícito) vira "o período
  // imediatamente antes do atual" — o caso mais comum, e o único que faz
  // sentido sem mais contexto.
  const previous = terms.filter((t) => t.order < currentTerm.order).sort((a, b) => b.order - a.order)[0];
  return previous?.id ?? null;
}

function titleFromMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length <= TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
}

async function assertConversationOwnership(tenantId: string, membershipId: string, conversationId: string) {
  const conversation = await prisma.aiChatConversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.tenantId !== tenantId || conversation.membershipId !== membershipId) {
    throw notFound("Conversa não encontrada.");
  }
  return conversation;
}

interface GenerateAndPersistParams {
  tenantId: string;
  membershipId: string;
  conversationId?: string;
  message: string;
  /**
   * `false` só pra "regenerar resposta" — a mensagem do usuário JÁ existe
   * (é a que está sendo respondida de novo), então não persiste outra
   * cópia dela, só a nova resposta da IA.
   */
  persistUserMessage: boolean;
  /**
   * Editar/regenerar precisam apagar mensagem(ns) antiga(s) — mas SÓ
   * depois que a geração nova já deu certo (nunca antes): se a IA falhar,
   * a mensagem original tem que continuar lá, não desaparecer sem nada
   * pra substituir. Por isso o corte de histórico usado no PROMPT
   * (`historyBeforeDate`) e o delete de fato (`deleteFromDate`) são
   * parâmetros separados, mesmo apontando pro mesmo instante na prática —
   * o delete só roda dentro da transação de sucesso, no fim desta função.
   */
  historyBeforeDate?: Date;
  deleteFromDate?: Date;
}

/**
 * Núcleo único de "gera e salva" — `sendChatMessage`, `editChatMessage` e
 * `regenerateResponse` são só 3 formas diferentes de chegar aqui (mensagem
 * nova, mensagem editada, ou resposta regenerada). Conversa nova só é
 * CRIADA de verdade se a geração der certo (ver bloco da transação) — criar
 * antes e deixar pra trás uma conversa vazia sempre que a IA falha na 1ª
 * mensagem (sem crédito, rate limit) foi um bug real que reproduzi ao
 * vivo: aparecia na sidebar como conversa fantasma, sem nenhuma mensagem.
 */
async function generateAndPersistReply(
  params: GenerateAndPersistParams
): Promise<{ reply: string; conversationId: string; suggestions: string[] }> {
  const { tenantId, membershipId, conversationId, message, persistUserMessage, historyBeforeDate, deleteFromDate } = params;

  if (conversationId) {
    await assertConversationOwnership(tenantId, membershipId, conversationId);
  }

  const recentHistory = conversationId
    ? await prisma.aiChatMessage.findMany({
        where: { conversationId, ...(historyBeforeDate ? { createdAt: { lt: historyBeforeDate } } : {}) },
        orderBy: { createdAt: "desc" },
        take: HISTORY_LIMIT,
      })
    : [];
  const chronological = [...recentHistory].reverse();
  const historyText = chronological.map((m) => `${m.role === "user" ? "Professor" : "Assistente"}: ${m.content}`).join("\n");

  const snapshot = await getTenantSnapshot(tenantId);
  // Segunda checagem de isolamento (a primeira já roda dentro de
  // getTenantSnapshot) — nada no prompt sai daqui sem passar por essa
  // função, então isso garante que o texto montado só referencia o tenant
  // certo antes de ir pro prompt.
  if (snapshot.tenantName === "") {
    throw new Error("Snapshot de IA vazio — recusando montar prompt sem contexto de tenant válido.");
  }

  // Busca SOB DEMANDA (Etapa P3) — só roda a query extra quando a
  // mensagem parece histórica/comparativa ("bimestre passado", "e no 1º
  // Bimestre?"); mais barato em token que sempre incluir todo o histórico
  // no prompt, e a maioria das perguntas nunca aciona isso.
  const historicalTermId = snapshot.termId ? await resolveHistoricalTermId(tenantId, message, snapshot.termId) : null;
  const historicalSnapshot = historicalTermId ? await getTenantSnapshotForTerm(tenantId, historicalTermId) : null;

  // Anonimização ANTES do prompt sair pro provider — troca cada nome real
  // de aluno flagged (o único lugar que o snapshot expõe nome de aluno,
  // ver chat-anonymize.ts) por um identificador ("Aluno_1", "Aluno_2"...).
  // Aplica no texto inteiro (snapshot + histórico + pergunta do professor),
  // não só no snapshot, porque o professor ou uma resposta anterior podem
  // mencionar o nome de novo em texto livre. Nomes do snapshot histórico
  // entram no MESMO anonimizador — nunca um nome real sai sem passar por
  // aqui, seja do período atual ou de um período passado buscado sob demanda.
  const allFlaggedNames = [
    ...snapshot.studentsNeedingAttention.map((f) => f.studentName),
    ...(historicalSnapshot?.studentsNeedingAttention.map((f) => f.studentName) ?? []),
  ];
  const anonymizer = buildChatAnonymizer(allFlaggedNames);

  const prompt = anonymizeForPrompt(
    [
      "Dados da escola:",
      formatSnapshot(snapshot),
      ...(historicalSnapshot ? ["", formatHistoricalSnapshot(historicalSnapshot)] : []),
      "",
      historyText ? `Conversa recente:\n${historyText}` : "(início da conversa)",
      "",
      `Pergunta do professor: ${message}`,
    ].join("\n"),
    anonymizer
  );

  // `timeoutMs: 20_000` (era 25_000) — testei a Gemini direto (fora do app,
  // sem nosso wrapper) e confirmei que a Google está com instabilidade
  // própria agora ("This model is currently experiencing high demand" /
  // 503, e sucessos legítimos levando 19-24s) — não é bug daqui, é
  // degradação real do provider. 15s (primeira tentativa) matava até
  // resposta que ia dar certo; 20s dá espaço pra isso sem segurar o
  // usuário pelos 25s inteiros do valor antigo.
  const result = await generate({
    system: SYSTEM_PROMPT,
    prompt,
    schema: chatResponseSchema,
    maxOutputTokens: 600,
    timeoutMs: 20_000,
  });

  await recordAiUsage({
    tenantId,
    membershipId,
    feature: "CHAT_PERGUNTAS",
    success: result.success,
    inputTokens: result.success ? result.usage.inputTokens : undefined,
    outputTokens: result.success ? result.usage.outputTokens : undefined,
  });

  if (!result.success) {
    throw new HttpError(502, result.error);
  }

  // `refused` substitui o antigo marcador de texto — nunca deixa a IA
  // responder fora de escopo, vira uma recusa amigável. Mesmo fluxo de
  // persistência abaixo (não um caminho separado): a recusa é uma
  // resposta de assistente como outra qualquer do ponto de vista de
  // armazenamento, só sem sugestões (não faz sentido sugerir próxima
  // pergunta em cima de uma recusa).
  const reply = result.data.refused
    ? "Não posso ajudar com esse assunto — sou especializada em apoio pedagógico (turmas, notas, frequência, BNCC). Pergunte algo relacionado à sua escola!"
    : deanonymizeReply(result.data.reply?.trim() || "Não consegui gerar uma resposta agora.", anonymizer);
  const suggestions = result.data.refused
    ? []
    : (result.data.suggestions ?? []).slice(0, 3).map((s) => deanonymizeReply(s, anonymizer));

  const finalConversationId = await prisma.$transaction(async (tx) => {
    const id =
      conversationId ??
      (await tx.aiChatConversation.create({ data: { tenantId, membershipId, title: titleFromMessage(message) } })).id;

    // Só chega aqui DEPOIS de `result.success` já confirmado — apagar o que
    // está sendo substituído (mensagem editada, ou resposta antiga no
    // regenerar) junto com a criação do novo, na mesma transação, garante
    // que uma falha de geração nunca destrua a mensagem original sem nada
    // pra colocar no lugar.
    if (deleteFromDate && conversationId) {
      await tx.aiChatMessage.deleteMany({ where: { conversationId, createdAt: { gte: deleteFromDate } } });
    }

    if (persistUserMessage) {
      await tx.aiChatMessage.create({ data: { tenantId, membershipId, conversationId: id, role: "user", content: message } });
    }
    await tx.aiChatMessage.create({ data: { tenantId, membershipId, conversationId: id, role: "assistant", content: reply } });
    await tx.aiChatConversation.update({ where: { id }, data: { updatedAt: new Date() } });

    return id;
  });

  return { reply, conversationId: finalConversationId, suggestions };
}

export interface SendChatMessageParams {
  tenantId: string;
  membershipId: string;
  message: string;
  /** Se omitido, cria uma conversa nova (título derivado desta mensagem). */
  conversationId?: string;
}

export async function sendChatMessage(params: SendChatMessageParams): Promise<{ reply: string; conversationId: string; suggestions: string[] }> {
  return generateAndPersistReply({ ...params, persistUserMessage: true });
}

export async function listConversations(tenantId: string, membershipId: string) {
  return prisma.aiChatConversation.findMany({
    where: { tenantId, membershipId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function deleteConversation(tenantId: string, membershipId: string, conversationId: string) {
  await assertConversationOwnership(tenantId, membershipId, conversationId);
  // onDelete: Cascade no schema apaga as mensagens junto.
  await prisma.aiChatConversation.delete({ where: { id: conversationId } });
}

export async function listChatHistory(tenantId: string, membershipId: string, conversationId: string, limit = 50) {
  await assertConversationOwnership(tenantId, membershipId, conversationId);
  const messages = await prisma.aiChatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return [...messages].reverse();
}

export async function deleteChatMessage(tenantId: string, membershipId: string, messageId: string) {
  const message = await prisma.aiChatMessage.findUnique({ where: { id: messageId } });
  if (!message || message.tenantId !== tenantId || message.membershipId !== membershipId) {
    throw notFound("Mensagem não encontrada.");
  }
  await prisma.aiChatMessage.delete({ where: { id: messageId } });
}

export interface EditChatMessageParams {
  tenantId: string;
  membershipId: string;
  messageId: string;
  newMessage: string;
}

/**
 * "Editar" reenvia o prompt alterado, não corrige a mensagem em si —
 * apaga a mensagem original (e a resposta da IA logo depois dela, já que
 * respondeu a um conteúdo que deixou de existir) e gera uma nova pergunta
 * na mesma conversa, mesmo padrão de produto que ChatGPT/Claude usam pra
 * "editar": trunca a partir do ponto editado, não empilha uma correção.
 */
export async function editChatMessage(params: EditChatMessageParams): Promise<{ reply: string; conversationId: string; suggestions: string[] }> {
  const { tenantId, membershipId, messageId, newMessage } = params;

  const original = await prisma.aiChatMessage.findUnique({ where: { id: messageId } });
  if (!original || original.tenantId !== tenantId || original.membershipId !== membershipId || original.role !== "user") {
    throw badRequest("Mensagem inválida para edição.");
  }

  const { conversationId, createdAt } = original;
  // O apagar de verdade só acontece dentro de generateAndPersistReply,
  // DEPOIS da geração nova já ter dado certo — ver comentário lá. Aqui só
  // define O QUE vai ser apagado (a mensagem editada em diante) e até
  // onde vai o histórico usado no prompt (tudo ANTES dela).
  return generateAndPersistReply({
    tenantId,
    membershipId,
    conversationId,
    message: newMessage,
    persistUserMessage: true,
    historyBeforeDate: createdAt,
    deleteFromDate: createdAt,
  });
}

/**
 * "Regenerar resposta" (2ª ação da mensagem da IA, ver ChatMessage.tsx) —
 * apaga a resposta atual e gera outra pra MESMA pergunta do usuário (a
 * mensagem de usuário imediatamente anterior), SEM duplicá-la (por isso
 * `persistUserMessage: false` — a pergunta original permanece intacta,
 * só a resposta é substituída). Não exige schema novo de feedback
 * (thumbs up/down) — a instrução permitia qualquer uma das duas ações.
 */
export async function regenerateResponse(
  tenantId: string,
  membershipId: string,
  assistantMessageId: string
): Promise<{ reply: string; conversationId: string; suggestions: string[] }> {
  const assistantMessage = await prisma.aiChatMessage.findUnique({ where: { id: assistantMessageId } });
  if (
    !assistantMessage ||
    assistantMessage.tenantId !== tenantId ||
    assistantMessage.membershipId !== membershipId ||
    assistantMessage.role !== "assistant"
  ) {
    throw badRequest("Mensagem inválida para regenerar.");
  }

  const { conversationId } = assistantMessage;
  const precedingUserMessage = await prisma.aiChatMessage.findFirst({
    where: { conversationId, role: "user", createdAt: { lt: assistantMessage.createdAt } },
    orderBy: { createdAt: "desc" },
  });
  if (!precedingUserMessage) {
    throw badRequest("Não foi possível encontrar a pergunta original pra regenerar.");
  }

  // Igual ao editChatMessage: o apagar de verdade (resposta atual + o que
  // vier depois) só acontece dentro de generateAndPersistReply, depois da
  // regeneração já ter dado certo. `historyBeforeDate` usa o createdAt da
  // PERGUNTA (não da resposta) — ela já entra no prompt via `message`
  // abaixo, então o histórico não pode incluí-la de novo.
  return generateAndPersistReply({
    tenantId,
    membershipId,
    conversationId,
    message: precedingUserMessage.content,
    persistUserMessage: false,
    historyBeforeDate: precedingUserMessage.createdAt,
    deleteFromDate: assistantMessage.createdAt,
  });
}
