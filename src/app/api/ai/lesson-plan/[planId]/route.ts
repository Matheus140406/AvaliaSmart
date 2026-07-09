import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getLessonPlan } from "@/services/ai/lesson-plan.service";

type RouteContext = { params: Promise<{ planId: string }> };

/** GET /api/ai/lesson-plan/[planId] — recupera um plano de aula já gerado (sem chamar a IA de novo). */
export const GET = withTenant<RouteContext>(async (_request: NextRequest, user, context) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para ver planos de aula.");
  }
  const { planId } = await context.params;
  const plan = await getLessonPlan(user.tenantId, planId);
  return apiSuccess(plan);
});
