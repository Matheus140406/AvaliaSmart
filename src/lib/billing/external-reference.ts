import type { PlanTier } from "@prisma/client";

const VALID_TIERS = new Set<PlanTier>([
  "TESTE_GRATIS",
  "MENSAL_BASE",
  "MENSAL_AVANCADO",
  "TRIMESTRAL",
  "SEMESTRAL",
]);

/**
 * Formato comum de `external_reference`/`externalReference` que os dois
 * gateways (Mercado Pago e Asaas) recebem de volta no webhook: `tenantId:tier`.
 * Extraído aqui porque as duas rotas de webhook precisavam da mesma lógica,
 * copiada e colada — um lugar só evita as duas cópias saírem de sincronia.
 */
export function parseExternalReference(ref: unknown): { tenantId: string; tier: PlanTier } | null {
  if (typeof ref !== "string") return null;
  const [tenantId, tier] = ref.split(":");
  if (!tenantId || !tier || !VALID_TIERS.has(tier as PlanTier)) return null;
  return { tenantId, tier: tier as PlanTier };
}
