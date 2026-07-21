import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MfaSettings } from "@/components/auth/MfaSettings";
import { PageTransition } from "@/components/motion/PageTransition";

/** /seguranca — configurações de conta (não de workspace): hoje só 2FA. */
export default async function SegurancaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div data-theme-surface className="min-h-dvh bg-[var(--color-surface-muted)] px-4 py-10">
      <PageTransition>
        <div className="mx-auto max-w-lg">
          <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Segurança da conta</h1>
          <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">
            Configurações da sua conta AvaliaSmart — válidas em todos os workspaces.
          </p>
          <MfaSettings />
        </div>
      </PageTransition>
    </div>
  );
}
