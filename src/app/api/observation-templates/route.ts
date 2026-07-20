import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getObservationTemplates, addObservationTemplate } from "@/services/observation-template.service";

/**
 * GET  /api/observation-templates — lista o banco de observações reutilizáveis do tenant.
 * POST /api/observation-templates — salva uma nova (texto livre, ou uma sugestão de IA aceita).
 */

const createSchema = z.object({
  text: z.string().trim().min(1, "Informe o texto da observação.").max(1000),
});

export const GET = withTenant(async (_request, user) => {
  const templates = await getObservationTemplates(user.tenantId);
  return apiSuccess(templates);
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para salvar observações.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.flatten());
  }

  const template = await addObservationTemplate(user.tenantId, user.id, parsed.data.text);
  return apiSuccess(template, 201);
});
