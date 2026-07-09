import { prisma } from "@/lib/prisma";
import { listActivePlans } from "@/repositories/plan.repository";

/**
 * Visão agregada Adimplente/Inadimplente (Etapa 7) — puramente uma LEITURA
 * do que já existe em `Subscription.status`, sem nenhuma lógica de cobrança
 * nova. "Adimplente" = ATIVA; qualquer outro status (EXPIRADA, CANCELADA,
 * INADIMPLENTE) entra como "Inadimplente" pra essa visão binária, mas o
 * status original vem junto pra não perder a nuance na tela.
 */
export interface TenantBillingRow {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  planName: string | null;
  planTier: string | null;
  status: string | null;
  adimplente: boolean;
  currentPeriodEnd: Date | null;
  createdAt: Date;
}

export async function listTenantsBillingStatus(): Promise<TenantBillingRow[]> {
  const [tenants, plans] = await Promise.all([
    prisma.tenant.findMany({ include: { subscription: true }, orderBy: { createdAt: "asc" } }),
    listActivePlans(),
  ]);
  const planNameByTier = new Map(plans.map((p) => [p.tier, p.name]));

  return tenants.map((t) => ({
    tenantId: t.id,
    tenantName: t.name,
    tenantSlug: t.slug,
    planName: t.subscription ? (planNameByTier.get(t.subscription.tier) ?? t.subscription.tier) : null,
    planTier: t.subscription?.tier ?? null,
    status: t.subscription?.status ?? null,
    adimplente: t.subscription?.status === "ATIVA",
    currentPeriodEnd: t.subscription?.currentPeriodEnd ?? null,
    createdAt: t.createdAt,
  }));
}
