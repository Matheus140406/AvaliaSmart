import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden, notFound } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getClassPerformanceData } from "@/repositories/performance.repository";

interface Context {
  params: Promise<{ classId: string }>;
}

const querySchema = z.object({ termId: z.string().min(1) });

/**
 * GET /api/turmas/[classId]/comparativo?termId= — dado pra comparativo
 * visual aluno vs. média da turma. Reaproveita `getClassPerformanceData`
 * (mesma agregação já usada pelo resumo de IA e pela predição de risco) —
 * nenhum cálculo de média novo aqui, só reempacota `allStudents` +
 * calcula a média da turma a partir dele.
 */
export const GET = withTenant<Context>(async (request, user, context) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para ver o comparativo da turma.");
  }

  const { classId } = await context.params;
  const parsed = querySchema.safeParse({ termId: request.nextUrl.searchParams.get("termId") });
  if (!parsed.success) {
    throw badRequest("Informe o período (termId).");
  }

  const data = await getClassPerformanceData(user.tenantId, classId, parsed.data.termId);
  if (!data) {
    throw notFound("Turma ou período não encontrado para este workspace.");
  }

  const withAverage = data.allStudents.filter((s) => s.average !== null);
  const classAverage =
    withAverage.length > 0 ? withAverage.reduce((sum, s) => sum + (s.average as number), 0) / withAverage.length : null;

  return apiSuccess({
    className: data.className,
    termName: data.termName,
    classAverage,
    students: data.allStudents.map((s) => ({ studentId: s.studentId, name: s.name, average: s.average })),
  });
});
