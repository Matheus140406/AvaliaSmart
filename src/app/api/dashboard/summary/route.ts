import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getDashboardSummary } from "@/repositories/dashboard-report.repository";

/**
 * GET /api/dashboard/summary — versão JSON do relatório consolidado do
 * tenant, pro painel do professor (gráfico, pontos de atenção, métricas).
 * Só existia a versão PDF (`/api/export/pdf/dashboard`) até agora — mesmo
 * RBAC/escopo, mesma fonte de dado (`dashboard-report.repository.ts`), só
 * devolvendo JSON em vez de renderizar um arquivo.
 */
export const GET = withTenant(async (_request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para ver o painel do dashboard.");
  }

  const summary = await getDashboardSummary(user.tenantId);
  return apiSuccess(summary);
});
