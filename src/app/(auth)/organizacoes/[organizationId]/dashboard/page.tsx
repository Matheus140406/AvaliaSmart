import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageTransition } from "@/components/motion/PageTransition";
import { OrganizationDashboard } from "@/components/auth/OrganizationDashboard";

/**
 * `/organizacoes/[organizationId]/dashboard` — consolidado cross-escola pro
 * dono da Organization (gap documentado desde a Etapa de hierarquia). A
 * verificação de dono + Membership ADMIN ativa por escola acontece no
 * service (ver organization.service.ts) — esta página só garante sessão.
 */
export default async function OrganizationDashboardPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { organizationId } = await params;

  return (
    <div data-theme-surface className="min-h-dvh bg-[var(--color-surface-muted)] px-4 py-10">
      <PageTransition>
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Dashboard consolidado</h1>
          <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">
            Visão agregada das escolas desta rede onde você administra ativamente.
          </p>
          <OrganizationDashboard organizationId={organizationId} />
        </div>
      </PageTransition>
    </div>
  );
}
