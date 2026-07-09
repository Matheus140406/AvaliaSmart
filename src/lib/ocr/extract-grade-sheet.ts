import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

/**
 * OCR de notas por foto — Recurso Chave 3.1 do briefing.
 *
 * v2: migrado do SDK da Anthropic direto pro Vercel AI SDK. O ganho real não
 * é "streaming" (uma extração de tabela precisa do objeto inteiro antes de
 * ser útil pro ImportWizard — não dá pra mapear colunas com metade dos dados)
 * — é `generateObject` fazer a validação de schema nativamente contra um
 * Zod schema, em vez do que a v1 fazia: pegar o `tool_use` block na mão e
 * confiar num `as` sem validação de verdade. Isso também deixa a troca de
 * provedor (Anthropic -> outro, se um dia fizer sentido) numa linha só.
 */

export interface OcrContext {
  studentNames: string[];
  evaluationNames: string[];
}

export interface ExtractedSheet {
  headers: string[];
  rows: (string | number | null)[][];
}

type SupportedMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const gradeSheetSchema = z.object({
  headers: z
    .array(z.string())
    .min(1)
    .describe(
      'Nomes das colunas na ordem em que aparecem na folha. A primeira deve ser o nome do aluno (ex: "Nome do Aluno").'
    ),
  rows: z
    .array(z.array(z.union([z.string(), z.number(), z.null()])))
    .describe(
      "Uma entrada por linha/aluno visível na folha. Cada linha tem um valor por header, na MESMA ordem dos headers."
    ),
});

export async function extractGradeSheetFromImage(
  imageBase64: string,
  mediaType: SupportedMediaType,
  context: OcrContext
): Promise<ExtractedSheet> {
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-5"),
    schema: gradeSheetSchema,
    maxOutputTokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image: imageBase64, mediaType },
          { type: "text", text: buildPrompt(context) },
        ],
      },
    ],
  });

  if (object.headers.length === 0) {
    throw new Error("O modelo não conseguiu identificar uma tabela nessa imagem.");
  }

  return object;
}

function buildPrompt(context: OcrContext): string {
  const studentList = context.studentNames.length > 0 ? context.studentNames.join(", ") : "(lista não disponível)";
  const evalList =
    context.evaluationNames.length > 0 ? context.evaluationNames.join(", ") : "(lista não disponível)";

  return [
    "Esta é uma foto de uma lista de notas escolares (impressa ou manuscrita).",
    "Extraia a tabela completa: cada linha é um aluno, cada coluna é uma avaliação (ou a matrícula).",
    "",
    `Alunos matriculados nesta turma — use como referência pra ler nomes manuscritos ambíguos, mas transcreva exatamente o que está na folha, não invente ou "corrija" pra bater com a lista: ${studentList}`,
    `Avaliações configuradas para este período — use como referência pros nomes das colunas de nota: ${evalList}`,
    "",
    "Regras obrigatórias:",
    "- A primeira coluna sempre é o nome do aluno.",
    "- Números decimais usam ponto, nunca vírgula (escreva 7.5, não 7,5).",
    "- Célula vazia, rasurada ou ilegível: use null. Nunca invente um valor plausível.",
    "- Não pule nenhuma linha visível na foto, mesmo que pareça incompleta.",
  ].join("\n");
}
