import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { listTenantsBillingStatus } from "@/services/platform-billing.service";

/**
 * `/financeiro` — visão operacional cross-tenant (Etapa 7): quem está
 * Adimplente/Inadimplente, direto de `Subscription.status`, sem lógica de
 * cobrança nova. Só pra quem está em `PLATFORM_ADMIN_EMAILS` — não é uma
 * tela de tenant, por isso `notFound()` (não um 403 visível) pra quem não
 * tem acesso, mesmo padrão de "não revelar que a rota existe".
 */
export default async function FinanceiroPage() {
  const session = await auth();
  if (!isPlatformAdmin(session?.user?.email)) notFound();

  const rows = await listTenantsBillingStatus();
  const adimplentes = rows.filter((r) => r.adimplente).length;
  const inadimplentes = rows.length - adimplentes;

  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Financeiro — visão geral</h1>
      <p className="mb-4 text-sm text-[var(--color-foreground-muted)]">
        Status de assinatura de todos os workspaces, direto de `Subscription.status` (sem lógica de cobrança nova).
      </p>

      <div className="mb-4 flex gap-4 text-sm">
        <Stat label="Workspaces" value={rows.length} tone="neutral" />
        <Stat label="Adimplentes" value={adimplentes} tone="positive" />
        <Stat label="Inadimplentes" value={inadimplentes} tone={inadimplentes > 0 ? "error" : "neutral"} />
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-muted)] text-xs text-[var(--color-foreground-muted)]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Workspace</th>
              <th className="px-3 py-2 text-left font-medium">Plano</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Situação</th>
              <th className="px-3 py-2 text-left font-medium">Vence em</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tenantId} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2 font-medium text-[var(--color-foreground)]">{r.tenantName}</td>
                <td className="px-3 py-2 text-[var(--color-foreground-muted)]">{r.planName ?? "—"}</td>
                <td className="px-3 py-2 text-[var(--color-foreground-muted)]">{r.status ?? "sem assinatura"}</td>
                <td className="px-3 py-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: r.adimplente
                        ? "color-mix(in srgb, var(--color-data-positive) 14%, transparent)"
                        : "color-mix(in srgb, var(--color-data-negative, #e11d48) 14%, transparent)",
                      color: r.adimplente ? "var(--color-data-positive)" : "var(--color-data-negative, #e11d48)",
                    }}
                  >
                    {r.adimplente ? "Adimplente" : "Inadimplente"}
                  </span>
                </td>
                <td className="px-3 py-2 text-[var(--color-foreground-muted)]">
                  {r.currentPeriodEnd ? new Date(r.currentPeriodEnd).toLocaleDateString("pt-BR") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "error" | "positive" }) {
  const color =
    tone === "error" ? "text-rose-500" : tone === "positive" ? "text-[var(--color-data-positive)]" : "text-[var(--color-foreground)]";
  return (
    <div>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-[var(--color-foreground-muted)]">{label}</p>
    </div>
  );
}
