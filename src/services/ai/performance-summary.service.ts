import { prisma } from "@/lib/prisma";
import { generate } from "./ai.service";
import { recordAiUsage } from "./guard";
import {
  getClassPerformanceData,
  getStudentPerformanceData,
  computeDataVersion,
  getEnrollmentIdsForClass,
  getEnrollmentIdsForStudent,
  type ClassPerformanceData,
  type StudentPerformanceData,
} from "@/repositories/performance.repository";
import { notFound, HttpError } from "@/lib/http/errors";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const SYSTEM_PROMPT = [
  "Você é um assistente pedagógico que resume desempenho escolar em português do Brasil.",
  "Escreva um resumo curto (2 a 4 frases), tom profissional e direto, sem jargão técnico.",
  "Destaque a mudança mais relevante (queda ou melhora de média, frequência baixa) e termine com uma recomendação prática quando fizer sentido.",
  "Nunca invente números — use só os dados fornecidos. Se não houver dados suficientes, diga isso claramente.",
].join(" ");

function formatSubjectLine(s: { subjectName: string; currentAverage: number | null; deltaPct: number | null }): string {
  const cur = s.currentAverage !== null ? s.currentAverage.toFixed(1) : "sem notas lançadas";
  const delta =
    s.deltaPct !== null ? ` (variação de ${s.deltaPct >= 0 ? "+" : ""}${s.deltaPct.toFixed(0)}% vs período anterior)` : "";
  return `- ${s.subjectName}: média ${cur}${delta}`;
}

/**
 * Escopo TURMA: nunca envia nome de aluno pra IA — só contagens agregadas
 * (ex: "4 alunos com frequência baixa"), igual ao exemplo do briefing. Ver
 * Etapa 5 (LGPD): dado de menor de idade só sai do servidor quando é
 * estritamente necessário pro resumo, e nome nunca é necessário num
 * resumo de TURMA.
 */
function buildClassPrompt(data: ClassPerformanceData): string {
  return [
    `Turma: ${data.className}`,
    `Período: ${data.termName}${data.previousTermName ? ` (comparando com ${data.previousTermName})` : " (sem período anterior pra comparar)"}`,
    `Total de alunos ativos: ${data.totalStudents}`,
    `Frequência média da turma: ${data.classAttendancePct.toFixed(0)}%`,
    `Alunos abaixo da média (considerando todas as disciplinas): ${data.studentsBelowAverage.length}`,
    `Alunos com frequência abaixo de 75%: ${data.studentsLowAttendance.length}`,
    "",
    "Médias por disciplina:",
    ...data.subjects.map(formatSubjectLine),
  ].join("\n");
}

/** Escopo ALUNO: nome do próprio aluno é o objeto do resumo — enviar é necessário e proporcional. */
function buildStudentPrompt(data: StudentPerformanceData): string {
  return [
    `Aluno: ${data.studentName}`,
    `Período: ${data.termName}${data.previousTermName ? ` (comparando com ${data.previousTermName})` : " (sem período anterior pra comparar)"}`,
    `Frequência: ${data.attendancePct.toFixed(0)}%`,
    "",
    "Médias por disciplina:",
    ...data.subjects.map(formatSubjectLine),
  ].join("\n");
}

export interface SummaryRequest {
  tenantId: string;
  membershipId: string;
  scopeType: "CLASS" | "STUDENT";
  scopeId: string;
  termId: string;
}

export interface SummaryResult {
  summary: string;
  cached: boolean;
}

export async function getPerformanceSummary(req: SummaryRequest): Promise<SummaryResult> {
  const { tenantId, scopeType, scopeId, termId } = req;

  const enrollmentIds =
    scopeType === "CLASS" ? await getEnrollmentIdsForClass(scopeId) : await getEnrollmentIdsForStudent(scopeId);
  const dataVersion = await computeDataVersion(termId, enrollmentIds);

  const cached = await prisma.aiSummaryCache.findUnique({
    where: { tenantId_scopeType_scopeId_termId: { tenantId, scopeType, scopeId, termId } },
  });
  const isFresh = cached && Date.now() - cached.generatedAt.getTime() < CACHE_TTL_MS;
  if (cached && isFresh && cached.dataVersion === dataVersion) {
    return { summary: cached.summary, cached: true };
  }

  const prompt =
    scopeType === "CLASS"
      ? await (async () => {
          const data = await getClassPerformanceData(tenantId, scopeId, termId);
          if (!data) throw notFound("Turma ou período não encontrado.");
          return buildClassPrompt(data);
        })()
      : await (async () => {
          const data = await getStudentPerformanceData(tenantId, scopeId, termId);
          if (!data) throw notFound("Aluno ou período não encontrado.");
          return buildStudentPrompt(data);
        })();

  const result = await generate({ system: SYSTEM_PROMPT, prompt, maxOutputTokens: 400, timeoutMs: 20_000 });

  await recordAiUsage({
    tenantId,
    membershipId: req.membershipId,
    feature: "RESUMO_DESEMPENHO",
    success: result.success,
    inputTokens: result.success ? result.usage.inputTokens : undefined,
    outputTokens: result.success ? result.usage.outputTokens : undefined,
  });

  if (!result.success) {
    throw new HttpError(502, result.error);
  }

  await prisma.aiSummaryCache.upsert({
    where: { tenantId_scopeType_scopeId_termId: { tenantId, scopeType, scopeId, termId } },
    create: { tenantId, scopeType, scopeId, termId, dataVersion, summary: result.data },
    update: { dataVersion, summary: result.data, generatedAt: new Date() },
  });

  return { summary: result.data, cached: false };
}
