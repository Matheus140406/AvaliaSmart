import { redirect } from "next/navigation";
import { auth, listMyWorkspaces } from "@/lib/auth";
import { listMyOrganizations } from "@/services/organization.service";
import { PageTransition } from "@/components/motion/PageTransition";
import { OneIcon } from "@/components/one/OneIcon";
import OrganizationManager from "@/components/auth/OrganizationManager";

/**
 * Tela de gestão de Organization (rede/grupo de escolas) — hierarquia
 * mínima viável do multi-escola: cria a Organization, vincula/desvincula
 * Tenants já existentes onde o usuário é ADMIN. Não escopada a um Tenant
 * ativo (igual /workspaces) — Organization é global ao User.
 */
export default async function OrganizacoesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [orgs, memberships] = await Promise.all([listMyOrganizations(session.user.id), listMyWorkspaces()]);

  // Só Tenants onde o usuário é ADMIN e que ainda não pertencem a nenhuma
  // Organization podem ser vinculados (ver regra em organization.service.ts).
  const candidateTenants = memberships
    .filter((m) => m.role === "ADMIN" && !m.tenant.organizationId)
    .map((m) => ({ id: m.tenantId, name: m.tenant.name }));

  return (
    <div data-theme-surface className="min-h-dvh bg-[var(--color-surface-muted)] px-4 py-16">
      <PageTransition>
        <div className="mx-auto max-w-md">
          <div className="mb-8 flex flex-col items-center gap-2">
            <OneIcon status="idle" size={48} />
            <span className="text-sm font-semibold tracking-wide text-[var(--color-foreground)]">AvaliaSmart</span>
          </div>

          <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Redes de escolas</h1>
          <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">
            Agrupe várias escolas sob uma Organization pra navegar entre elas mais fácil. Isso não muda quem tem
            acesso a cada escola — cada uma continua com suas próprias permissões.
          </p>

          <OrganizationManager
            organizations={orgs.map((o) => ({ id: o.id, name: o.name, tenants: o.tenants }))}
            candidateTenants={candidateTenants}
          />
        </div>
      </PageTransition>
    </div>
  );
}
