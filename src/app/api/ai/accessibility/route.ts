import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requireAiFeature } from "@/services/ai/guard";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { generateAccessibilityContent } from "@/services/ai/accessibility.service";

/**
 * POST /api/ai/accessibility — Etapa 6 da expansão de produtividade
 * docente. JSON simples (não multipart), igual ao Adaptador de Nível de
 * Texto: só texto colado, sem opção de foto/documento.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  text: z.string().trim().min(30, "Texto muito curto — envie pelo menos 30 caracteres."),
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para gerar conteúdo de acessibilidade.");
  }

  const accessBlock = await requireAiFeature(user.tenantId, "accessibility");
  if (accessBlock) return accessBlock;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  const content = await generateAccessibilityContent({
    tenantId: user.tenantId,
    membershipId: user.id,
    sourceText: parsed.data.text,
  });

  return apiSuccess(content);
});
