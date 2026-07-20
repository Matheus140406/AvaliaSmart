import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest } from "@/lib/http/errors";
import { requireAiFeature } from "@/services/ai/guard";
import { predictClassRisk } from "@/services/ai/risk-prediction.service";

/**
 * POST /api/analytics/predict — predição de risco de reprovação por turma.
 * Antes um esqueleto (501); a implementação de verdade mora em
 * `services/ai/risk-prediction.service.ts` (reaproveita a mesma agregação
 * de médias/frequência do resumo de desempenho + a cadeia de fallback de
 * IA já existente em `ai.service.ts`).
 *
 * `requireAiFeature` faz DUAS coisas de uma vez: confere o flag de plano
 * (substituindo o `requireFeature` mais simples de antes) E aplica rate
 * limit de IA — sem isso, uma feature vendida em TODOS os planos (inclusive
 * o trial) que dispara uma chamada de LLM por turma ficaria sem nenhum
 * freio de custo/abuso.
 *
 * SEM `export const runtime = "edge"`: o PrismaClient padrão não roda em
 * Edge Runtime (ver lib/prisma.ts). `maxDuration` alto porque quem precisa
 * de mais tempo pra chamada externa lenta é o runtime Node.js com Fluid
 * Compute, não o Edge (que tem o limite mais curto, não o contrário).
 */

export const runtime = "nodejs";
export const maxDuration = 60; // chamadas a LLM externo variam bastante; 60s dá folga

const predictSchema = z.object({
  classId: z.string().min(1),
  termId: z.string().min(1),
});

export const POST = withTenant(async (request, user) => {
  const body = await request.json().catch(() => null);
  const parsed = predictSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  const planBlock = await requireAiFeature(user.tenantId, "riskPrediction");
  if (planBlock) return planBlock;

  const assessments = await predictClassRisk({
    tenantId: user.tenantId,
    membershipId: user.id,
    classId: parsed.data.classId,
    termId: parsed.data.termId,
  });

  return apiSuccess(assessments);
});
