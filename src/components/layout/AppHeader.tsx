import Link from "next/link";
import Image from "next/image";
import { Bell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { auth, getCurrentUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { UserMenu } from "@/components/layout/UserMenu";
import { MobileNav } from "@/components/layout/MobileNav";

/**
 * Cabeçalho único de `(dashboard)` — logo + nome do tenant ativo +
 * identidade do professor (avatar/nome/dropdown) + ThemeToggle. Antes, cada
 * página montava (ou não) o próprio cabeçalho; agora mora só aqui, aplicado
 * via `(dashboard)/layout.tsx`.
 *
 * Server Component (async): busca tenant/sessão direto, sem passar por
 * `withTenant` (isso é renderização de página, não uma rota de API) — só
 * lê o próprio tenant/usuário logado, então não há risco de vazamento
 * entre tenants aqui. "Trocar workspace" e "Sair" viraram itens do dropdown
 * do `UserMenu` (client component) em vez de um link solto no header.
 */
export async function AppHeader() {
  const [session, user] = await Promise.all([auth(), getCurrentUser()]);
  const tenant = user
    ? await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } })
    : null;

  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center justify-between border-b px-4 backdrop-blur sm:px-8"
      style={{ borderColor: "#171b26", backgroundColor: "rgba(10, 12, 18, 0.72)" }}
    >
      <div className="flex items-center gap-1">
        <MobileNav />
        <Link href="/" className="flex items-center gap-2 min-[900px]:hidden">
          <Image src="/logo-principal.png" alt="AvaliaSmart" width={28} height={24} className="h-6 w-auto" priority />
          <span className="font-heading text-sm font-semibold text-[var(--color-foreground-strong)]">AvaliaSmart</span>
        </Link>
        {tenant && (
          <span className="hidden text-xs text-[var(--color-foreground-muted)] min-[900px]:inline">{tenant.name}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Notificações"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]"
        >
          <Bell size={17} />
        </button>
        <ThemeToggle />
        {session?.user && <UserMenu name={session.user.name ?? "Usuário"} email={session.user.email ?? ""} />}
      </div>
    </header>
  );
}
