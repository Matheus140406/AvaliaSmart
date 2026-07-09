import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requireAiFeature } from "@/services/ai/guard";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { adaptTextLevel } from "@/services/ai/text-level-adapter.service";

/**
 * POST /api/ai/text-level-adapter — Etapa 4 da expansão de produtividade
 * docente. JSON simples (não multipart): só texto colado + nível-alvo, sem
 * opção de foto/documento (não pedida nesta feature).
 */

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  text: z.string().trim().min(20, "Texto muito curto — envie pelo menos 20 caracteres."),
  targetLevel: z.enum(["FUNDAMENTAL", "MEDIO", "EJA"]),
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para adaptar texto.");
  }

  const accessBlock = await requireAiFeature(user.tenantId, "textLevelAdapter");
  if (accessBlock) return accessBlock;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  const result = await adaptTextLevel({
    tenantId: user.tenantId,
    membershipId: user.id,
    sourceText: parsed.data.text,
    targetLevel: parsed.data.targetLevel,
  });

  return apiSuccess(result);
});
