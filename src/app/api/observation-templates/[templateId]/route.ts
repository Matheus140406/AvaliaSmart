import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { removeObservationTemplate } from "@/services/observation-template.service";

type RouteContext = { params: Promise<{ templateId: string }> };

/** DELETE /api/observation-templates/[templateId] — remove um modelo salvo. */
export const DELETE = withTenant<RouteContext>(async (_request, user, context) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para excluir observações.");
  }
  const { templateId } = await context.params;
  await removeObservationTemplate(user.tenantId, templateId);
  return apiSuccess({ id: templateId });
});
