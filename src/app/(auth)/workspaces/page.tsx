import { redirect } from "next/navigation";
import { auth, listMyWorkspaces } from "@/lib/auth";
import WorkspaceSwitcher, { type WorkspaceOption } from "@/components/auth/WorkspaceSwitcher";
import CreateWorkspaceForm from "@/components/auth/CreateWorkspaceForm";
import { OneIcon } from "@/components/one/OneIcon";
import { PageTransition } from "@/components/motion/PageTransition";

export default async function WorkspacesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const memberships = await listMyWorkspaces();

  return (
    <div data-theme-surface className="min-h-dvh bg-[var(--color-surface-muted)] px-4 py-16">
      <PageTransition>
        <div className="mx-auto max-w-md">
          <div className="mb-8 flex flex-col items-center gap-2">
            <OneIcon status="idle" size={48} />
            <span className="text-sm font-semibold tracking-wide text-[var(--color-foreground)]">AvaliaSmart</span>
          </div>

          <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Escolha um workspace</h1>

          {memberships.length === 0 ? (
            <>
              <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">
                Você ainda não faz parte de nenhum workspace. Crie o seu — leva menos de um minuto.
              </p>
              <CreateWorkspaceForm />
            </>
          ) : (
            <>
              <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">
                Selecione onde deseja trabalhar agora — você poderá alternar entre workspaces a qualquer momento.
              </p>
              <WorkspaceSwitcher
                workspaces={memberships.map(
                  (m: (typeof memberships)[number]): WorkspaceOption => ({
                    tenantId: m.tenantId,
                    tenantName: m.tenant.name,
                    tenantType: m.tenant.type,
                    role: m.role,
                    organization: m.tenant.organization,
                  })
                )}
              />

              <div className="my-8 flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--color-border)]" />
                <span className="text-xs text-[var(--color-foreground-muted)]">ou</span>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
              </div>

              <CreateWorkspaceForm />

              <p className="mt-6 text-center text-xs text-[var(--color-foreground-muted)]">
                Administra mais de uma escola?{" "}
                <a href="/organizacoes" className="font-medium text-brand underline underline-offset-2">
                  Gerencie suas redes de escolas
                </a>
              </p>
            </>
          )}
        </div>
      </PageTransition>
    </div>
  );
}
