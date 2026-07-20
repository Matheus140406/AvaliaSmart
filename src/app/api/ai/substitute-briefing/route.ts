import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest } from "@/lib/http/errors";
import { requireAiAccess } from "@/services/ai/guard";
import { generateSubstituteBriefing } from "@/services/ai/substitute-briefing.service";

/**
 * POST /api/ai/substitute-briefing — "modo professor substituto" (Etapa 10).
 *
 * SEM `export const runtime = "edge"`: mesmo motivo do /api/analytics/predict
 * — o PrismaClient padrão não roda em Edge Runtime. `maxDuration` alto pelo
 * mesmo racional: chamada de IA processando o roster inteiro da turma.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  classId: z.string().min(1),
  termId: z.string().min(1),
});

export const POST = withTenant(async (request, user) => {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  const accessBlock = await requireAiAccess(user.tenantId);
  if (accessBlock) return accessBlock;

  const briefing = await generateSubstituteBriefing({
    tenantId: user.tenantId,
    membershipId: user.id,
    classId: parsed.data.classId,
    termId: parsed.data.termId,
  });

  return apiSuccess(briefing);
});
