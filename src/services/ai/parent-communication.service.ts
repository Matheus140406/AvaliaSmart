import { prisma } from "@/lib/prisma";
import { generate } from "./ai.service";
import { recordAiUsage } from "./guard";
import { notFound, HttpError } from "@/lib/http/errors";

/**
 * Geração automática de comunicado pra pais/responsáveis (Etapa 9 do épico de
 * novas features) — rascunho pronto pra enviar (reunião, aviso, recado
 * pontual), o professor só copia/edita antes de mandar. Sem persistência: ao
 * contrário do resumo de desempenho (cache) e da sugestão de observação
 * (banco de feedback), aqui não há dado derivado que valha a pena guardar —
 * cada geração é um rascunho descartável.
 *
 * Escopo TURMA nunca inclui nome de aluno no prompt (mesmo racional do
 * resumo de turma em performance-summary.service.ts). Escopo ALUNO inclui o
 * nome do próprio aluno (é o assunto do comunicado) e retorna os contatos
 * dos responsáveis pra o frontend oferecer envio direto por WhatsApp.
 */

const SYSTEM_PROMPT = [
  "Você é um assistente que ajuda professores e escolas brasileiras a redigir comunicados para pais e responsáveis.",
  "Escreva um comunicado completo, pronto para enviar por e-mail ou WhatsApp: saudação, corpo do texto e despedida.",
  "Use SOMENTE as informações fornecidas — nunca invente datas, locais ou horários que não estejam no assunto informado.",
  "Se o tom pedido for formal, use linguagem institucional. Se for informal, use um tom próximo e cordial, mas sempre profissional.",
].join(" ");

export type CommunicationTone = "formal" | "informal";
export type CommunicationScope = "CLASS" | "STUDENT";

export interface GenerateCommunicationParams {
  tenantId: string;
  membershipId: string;
  scopeType: CommunicationScope;
  scopeId: string;
  context: string;
  tone: CommunicationTone;
}

export interface GuardianContact {
  name: string;
  phone: string | null;
}

export interface CommunicationResult {
  message: string;
  guardians?: GuardianContact[];
}

async function buildPrompt(params: GenerateCommunicationParams): Promise<{ prompt: string; guardians?: GuardianContact[] }> {
  const toneLabel = params.tone === "informal" ? "informal (mas profissional)" : "formal (institucional)";

  if (params.scopeType === "CLASS") {
    const klass = await prisma.class.findFirst({ where: { id: params.scopeId, tenantId: params.tenantId } });
    if (!klass) throw notFound("Turma não encontrada.");
    return {
      prompt: [
        `Destinatário: responsáveis de todos os alunos da turma "${klass.name}".`,
        `Tom: ${toneLabel}.`,
        `Assunto do comunicado: ${params.context}`,
        "",
        'Gere o comunicado começando com uma saudação genérica como "Prezados pais e responsáveis,".',
      ].join("\n"),
    };
  }

  const student = await prisma.student.findFirst({
    where: { id: params.scopeId, tenantId: params.tenantId },
    include: { guardians: { include: { guardian: true } } },
  });
  if (!student) throw notFound("Aluno não encontrado.");

  const guardians: GuardianContact[] = student.guardians.map((sg) => ({ name: sg.guardian.name, phone: sg.guardian.phone }));

  return {
    prompt: [
      `Destinatário: responsável(is) pelo aluno ${student.name}.`,
      `Tom: ${toneLabel}.`,
      `Assunto do comunicado: ${params.context}`,
      "",
      `Gere o comunicado começando com uma saudação dirigida ao responsável do aluno ${student.name}.`,
    ].join("\n"),
    guardians,
  };
}

export async function generateParentCommunication(params: GenerateCommunicationParams): Promise<CommunicationResult> {
  const { prompt, guardians } = await buildPrompt(params);

  const result = await generate({ system: SYSTEM_PROMPT, prompt, maxOutputTokens: 500, timeoutMs: 20_000 });

  await recordAiUsage({
    tenantId: params.tenantId,
    membershipId: params.membershipId,
    feature: "COMUNICADO_PAIS",
    success: result.success,
    inputTokens: result.success ? result.usage.inputTokens : undefined,
    outputTokens: result.success ? result.usage.outputTokens : undefined,
  });

  if (!result.success) {
    throw new HttpError(502, result.error);
  }

  return { message: result.data, guardians };
}
