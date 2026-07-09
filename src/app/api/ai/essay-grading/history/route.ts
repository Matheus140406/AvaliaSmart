import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest } from "@/lib/http/errors";
import { getEssayGradingHistory } from "@/services/ai/essay-grading.service";

/**
 * GET /api/ai/essay-grading/history?studentLabel=X — histórico de redações
 * do mesmo aluno (IA e manual, mesma tabela) — usado pelo corretor manual
 * pra ver a evolução antes de atribuir a nota atual.
 *
 * Filtros opcionais: `gradedBy` (ai|human) e `from`/`to` (YYYY-MM-DD) —
 * aplicados em cima do match por aluno, não substituem ele.
 */
export const GET = withTenant(async (request, user) => {
  const params = request.nextUrl.searchParams;
  const studentLabel = params.get("studentLabel")?.trim();
  if (!studentLabel) {
    throw badRequest("Informe `studentLabel` na query string.");
  }

  const gradedByParam = params.get("gradedBy");
  if (gradedByParam && gradedByParam !== "ai" && gradedByParam !== "human") {
    throw badRequest("`gradedBy` precisa ser `ai` ou `human`.");
  }

  const fromParam = params.get("from");
  const toParam = params.get("to");
  const from = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : undefined;
  const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : undefined;
  if ((fromParam && Number.isNaN(from?.getTime())) || (toParam && Number.isNaN(to?.getTime()))) {
    throw badRequest("Data inválida em `from`/`to` — use YYYY-MM-DD.");
  }

  const history = await getEssayGradingHistory(user.tenantId, studentLabel, {
    gradedBy: gradedByParam as "ai" | "human" | undefined,
    from,
    to,
  });
  return apiSuccess(history);
});
