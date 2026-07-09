import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { requireFeature } from "@/lib/billing/guard";
import { badRequest, HttpError } from "@/lib/http/errors";

/**
 * Esqueleto do endpoint de predição de risco — a implementação de verdade
 * (via Claude/Anthropic) é a Etapa 6 do plano de IA. O que importa fixar
 * AGORA é o runtime certo:
 *
 * - SEM `export const runtime = "edge"`. O PrismaClient padrão (o que já
 *   está em lib/prisma.ts) não roda em Edge Runtime — a mensagem de erro do
 *   próprio Prisma é literal: "PrismaClient is not configured to run in
 *   Vercel Edge Functions". Rodar aqui exigiria trocar pra um driver HTTP
 *   (Neon/PlanetScale serverless) + Driver Adapters do Prisma — troca de
 *   infra, não uma flag.
 * - `maxDuration` alto, porque quem precisa de mais tempo pra chamada
 *   externa lenta é o runtime Node.js com Fluid Compute (padrão hoje na
 *   Vercel), não o Edge — Edge tem o limite mais curto dos dois (~30s),
 *   não o contrário.
 */

export const runtime = "nodejs";
export const maxDuration = 60; // chamadas a LLM externo variam bastante; 60s dá folga

const predictSchema = z.object({
  classId: z.string().min(1),
});

export const POST = withTenant(async (request, user) => {
  const planBlock = await requireFeature(
    user.tenantId,
    "riskPrediction",
    "Predição de risco de reprovação"
  );
  if (planBlock) return planBlock;

  const body = await request.json().catch(() => null);
  const parsed = predictSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  // TODO (Etapa 6 — Integração com IA): carregar histórico de notas/faltas
  // da turma (classId, já validado pelo tenant), montar o prompt e chamar
  // services/ai.service.ts, devolvendo { studentId, riskLevel, reasoning }[].
  void user;

  throw new HttpError(501, "Predição de risco ainda não implementada — reservado pra Etapa 6 (IA).");
});
