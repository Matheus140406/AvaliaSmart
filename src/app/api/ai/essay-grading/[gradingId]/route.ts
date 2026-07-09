import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getEssayGrading } from "@/services/ai/essay-grading.service";

type RouteContext = { params: Promise<{ gradingId: string }> };

/** GET /api/ai/essay-grading/[gradingId] — recupera uma correção já gerada (sem chamar a IA de novo). */
export const GET = withTenant<RouteContext>(async (_request: NextRequest, user, context) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para ver correções de redação.");
  }
  const { gradingId } = await context.params;
  const grading = await getEssayGrading(user.tenantId, gradingId);
  return apiSuccess(grading);
});
