import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generate } from "./ai.service";
import { recordAiUsage } from "./guard";
import { getStudentPerformanceData } from "@/repositories/performance.repository";
import { notFound, badRequest, HttpError } from "@/lib/http/errors";

/**
 * Sugestão de observação de boletim (Etapa 2). A IA NUNCA escreve direto no
 * boletim — isto só gera sugestões; o professor aceita, edita ou descarta
 * (a UI que consome isso é responsabilidade do frontend). O feedback
 * (👍/👎) fica salvo pra calibrar o prompt depois.
 */

const SYSTEM_PROMPT = [
  "Você é um assistente pedagógico que ajuda professores brasileiros a escrever observações de boletim escolar.",
  "Gere sugestões de observação curtas (1-2 frases cada), tom profissional e construtivo — nunca genérico ou robótico.",
  "Baseie-se SOMENTE nos dados fornecidos (notas e frequência). Nunca invente fatos sobre o comportamento ou personalidade do aluno.",
  "Evite clichês vazios como 'o aluno tem potencial' sem embasamento nos dados.",
].join(" ");

const suggestionSchema = z.object({
  suggestions: z.array(z.string().min(10)).min(2).max(3),
});

export interface CreateSuggestionParams {
  tenantId: string;
  membershipId: string;
  studentId: string;
  termId: string;
}

function buildPrompt(data: Awaited<ReturnType<typeof getStudentPerformanceData>>): string {
  if (!data) throw notFound("Aluno ou período não encontrado.");
  const subjectLines = data.subjects.map((s) => {
    const cur = s.currentAverage !== null ? s.currentAverage.toFixed(1) : "sem notas lançadas";
    return `- ${s.subjectName}: média ${cur}`;
  });
  return [
    `Aluno: ${data.studentName}`,
    `Período: ${data.termName}`,
    `Frequência: ${data.attendancePct.toFixed(0)}%`,
    "",
    "Médias por disciplina:",
    ...subjectLines,
    "",
    "Gere 2 a 3 sugestões de observação de boletim pra este aluno neste período.",
  ].join("\n");
}

export async function createObservationSuggestions(params: CreateSuggestionParams) {
  const data = await getStudentPerformanceData(params.tenantId, params.studentId, params.termId);
  if (!data) throw notFound("Aluno ou período não encontrado.");

  const prompt = buildPrompt(data);
  const result = await generate({
    system: SYSTEM_PROMPT,
    prompt,
    schema: suggestionSchema,
    maxOutputTokens: 500,
    timeoutMs: 20_000,
  });

  await recordAiUsage({
    tenantId: params.tenantId,
    membershipId: params.membershipId,
    feature: "SUGESTAO_OBSERVACAO",
    success: result.success,
    inputTokens: result.success ? result.usage.inputTokens : undefined,
    outputTokens: result.success ? result.usage.outputTokens : undefined,
  });

  if (!result.success) {
    throw new HttpError(502, result.error);
  }

  const saved = await prisma.aiObservationSuggestion.create({
    data: {
      tenantId: params.tenantId,
      studentId: params.studentId,
      termId: params.termId,
      membershipId: params.membershipId,
      suggestions: result.data.suggestions,
    },
  });

  return { id: saved.id, suggestions: result.data.suggestions };
}

export async function submitObservationFeedback(params: {
  tenantId: string;
  suggestionId: string;
  feedback: "POSITIVO" | "NEGATIVO";
}) {
  const suggestion = await prisma.aiObservationSuggestion.findUnique({ where: { id: params.suggestionId } });
  if (!suggestion || suggestion.tenantId !== params.tenantId) {
    throw notFound("Sugestão não encontrada.");
  }
  if (suggestion.feedback) {
    throw badRequest("Essa sugestão já recebeu feedback.");
  }

  return prisma.aiObservationSuggestion.update({
    where: { id: params.suggestionId },
    data: { feedback: params.feedback, feedbackAt: new Date() },
  });
}

