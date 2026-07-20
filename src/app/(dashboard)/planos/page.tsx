import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { resolveSubscription } from "@/lib/billing/guard";
import { listActivePlans } from "@/repositories/plan.repository";
import { PlanosToggleView } from "@/components/billing/PlanosToggleView";
import { ReceiptsList } from "@/components/billing/ReceiptsList";

export default async function PlanosPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  const [sub, plans] = await Promise.all([resolveSubscription(user.tenantId), listActivePlans()]);
  const paidPlans = plans.filter((p) => p.tier !== "TESTE_GRATIS");
  const featuredTier = paidPlans.reduce((best, p) =>
    p.priceCentsMonthlyEquiv < best.priceCentsMonthlyEquiv ? p : best
  ).tier;

  const trialDaysLeft =
    sub?.plan.tier === "TESTE_GRATIS" && sub.trialEndsAt
      ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
      : null;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Planos</h1>

      {sub ? (
        <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">
          Plano atual: <span className="font-medium text-[var(--color-foreground)]">{sub.plan.name}</span>
          {trialDaysLeft !== null && sub.isUsable && (
            <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
              {trialDaysLeft} {trialDaysLeft === 1 ? "dia restante" : "dias restantes"}
            </span>
          )}
          {!sub.isUsable && (
            <span className="ml-2 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs text-rose-500">
              {sub.plan.tier === "TESTE_GRATIS" ? "Teste encerrado" : sub.status.toLowerCase()}
            </span>
          )}
        </p>
      ) : (
        <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">Este workspace ainda não tem assinatura.</p>
      )}

      <PlanosToggleView
        plans={paidPlans}
        currentTier={sub?.plan.tier ?? null}
        isCurrentUsable={sub?.isUsable ?? false}
        featuredTier={featuredTier}
      />

      <p className="mt-6 text-xs text-[var(--color-foreground-muted)]">
        Todo workspace novo começa com 5 dias de teste grátis, sem cartão.
      </p>

      {user.role === "ADMIN" && (
        <div className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">Comprovantes de pagamento</h2>
          <ReceiptsList />
        </div>
      )}
    </div>
  );
}
