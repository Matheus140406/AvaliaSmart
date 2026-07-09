import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { createExportShareLink } from "@/services/export/share-link.service";

/**
 * POST /api/export/share-link — gera o link temporário/assinado usado pelo
 * botão "Compartilhar no WhatsApp" (o wa.me só aceita texto/link, nunca
 * anexo direto; as rotas de export normais exigem cookie de sessão, então
 * não dá pra colar a URL delas cruas num link de WhatsApp).
 */
const bodySchema = z.object({
  kind: z.enum(["dashboard-pdf", "dashboard-excel", "boletim-pdf", "receipt-pdf"]),
  params: z.record(z.string(), z.string()).default({}),
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para compartilhar exports.");
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  const { token, expiresAt } = await createExportShareLink(user.tenantId, parsed.data.kind, parsed.data.params);
  const url = `${request.nextUrl.origin}/api/export/download/${token}`;

  return apiSuccess({ url, expiresAt: expiresAt.toISOString() }, 201);
});
