import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { OneIcon } from "@/components/one/OneIcon";
import { AnimatedCard } from "@/components/motion/AnimatedCard";
import { MfaVerifyForm } from "@/components/auth/MfaVerifyForm";

/**
 * /mfa-verificar — segundo fator pra login via Google numa conta com MFA
 * ativado (proxy.ts redireciona pra cá enquanto `session.mfaPending`).
 * Sem sessão nenhuma, nem faz sentido estar aqui -> /login. Sem MFA
 * pendente (já verificado, ou conta sem MFA), também não -> segue pro app.
 */
export default async function MfaVerificarPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!session.mfaPending) redirect("/");

  return (
    <div data-theme-surface className="flex min-h-dvh items-center justify-center bg-[var(--color-surface-muted)] px-4">
      <AnimatedCard
        className="w-full max-w-sm rounded-lg border p-6 text-center"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <div className="mb-6 flex flex-col items-center gap-2">
          <OneIcon status="idle" size={40} />
        </div>
        <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Confirme seu acesso</h1>
        <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">
          Esta conta tem autenticação de dois fatores ativada. Digite o código do seu app autenticador.
        </p>
        <MfaVerifyForm />
      </AnimatedCard>
    </div>
  );
}
