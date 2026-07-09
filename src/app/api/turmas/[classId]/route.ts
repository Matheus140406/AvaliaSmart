import { withTenant } from "@/lib/with-tenant";
import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/http/api-response";
import { forbidden, notFound } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getDashboardReport } from "@/repositories/dashboard-report.repository";

interface Context {
  params: Promise<{ classId: string }>;
}

/**
 * GET /api/turmas/[classId] — tela "Detalhes da Turma" do handoff de
 * design. Reaproveita `getDashboardReport` (mesma agregação já usada no
 * painel/PDF) e filtra pra ESTA turma, em vez de duplicar a lógica de
 * média/frequência — troca um pouco de trabalho redundante de query por
 * zero chance de os dois números divergirem no futuro.
 *
 * "Linha do tempo": só 2 tipos de evento têm data real hoje —
 * `GradeConfig.createdAt` (avaliação criada, campo novo desta rodada) e
 * `AiSummaryCache.generatedAt` (resumo da One gerado). O design original
 * também lista "criação da turma" e "recuperação" como tipos de evento,
 * mas `Class` não tem `createdAt` e não existe um registro dedicado de
 * "recuperação aplicada" — omitidos aqui de propósito, não fabricados.
 */
export const GET = withTenant<Context>(async (_request, user, context) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para ver detalhes da turma.");
  }

  const { classId } = await context.params;

  const klass = await prisma.class.findFirst({
    where: { id: classId, tenantId: user.tenantId },
    include: { enrollments: { where: { status: "ATIVA" } } },
  });
  if (!klass) {
    throw notFound("Turma não encontrada.");
  }

  const report = await getDashboardReport(user.tenantId);
  const classRow = report.classes.find((c) => c.className === klass.name) ?? null;
  const attentionStudents = report.attentionPoints.filter((p) => p.className === klass.name);

  const overallAverage =
    classRow && classRow.subjects.length > 0
      ? (() => {
          const latest = classRow.subjects
            .map((s) => {
              for (let i = s.termAverages.length - 1; i >= 0; i--) {
                if (s.termAverages[i].average !== null) return s.termAverages[i].average;
              }
              return null;
            })
            .filter((a): a is number => a !== null);
          return latest.length > 0 ? latest.reduce((a, b) => a + b, 0) / latest.length : null;
        })()
      : null;

  const classSubjectIds = (await prisma.classSubject.findMany({ where: { classId }, select: { id: true } })).map((cs) => cs.id);

  const recentAssessments = await prisma.gradeConfig.findMany({
    where: { classSubjectId: { in: classSubjectIds } },
    include: { classSubject: { include: { subject: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const summaries = await prisma.aiSummaryCache.findMany({
    where: { tenantId: user.tenantId, scopeType: "CLASS", scopeId: classId },
    orderBy: { generatedAt: "desc" },
    take: 5,
  });

  const timeline = [
    ...recentAssessments.map((a) => ({
      type: "avaliacao" as const,
      title: `Avaliação criada: ${a.name}`,
      description: a.classSubject.subject.name,
      date: a.createdAt.toISOString(),
    })),
    ...summaries.map((s) => ({
      type: "resumo_one" as const,
      title: "Resumo da One gerado",
      description: `Período: ${s.termId}`,
      date: s.generatedAt.toISOString(),
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return apiSuccess({
    class: {
      id: klass.id,
      name: klass.name,
      gradeLevel: klass.gradeLevel,
      shift: klass.shift,
      studentCount: klass.enrollments.length,
    },
    metrics: {
      averageGrade: overallAverage,
      attendancePct: classRow?.attendancePct ?? null,
    },
    attentionStudents,
    timeline,
  });
});
