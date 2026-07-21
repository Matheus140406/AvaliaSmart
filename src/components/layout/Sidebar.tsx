"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LayoutDashboard, Users, ClipboardCheck, PenLine, Upload, CreditCard, MessageSquare, LogOut, Plus, Sparkles, Building2, Tags, UserPlus, NotebookPen, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OneAvatar } from "@/components/one/OneAvatar";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: "IA";
}

/**
 * "Avaliações" aponta pro stepper novo (`/avaliacoes/nova`); os outros
 * itens são páginas reais já existentes no produto. "Alunos" e
 * "Relatórios" do handoff de design original foram omitidos de propósito
 * (sem página real por trás) — ver histórico desta mesma sessão. "Chat com
 * a One" saiu do menu principal e virou o card de CTA no rodapé, conforme
 * o redesign dark.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/turmas", label: "Turmas", icon: Users },
  { href: "/avaliacoes/nova", label: "Avaliações", icon: ClipboardCheck },
  { href: "/tipos-avaliacao", label: "Tipos de avaliação", icon: Tags },
  { href: "/redacao", label: "Correção de redação", icon: PenLine, badge: "IA" },
  { href: "/observacoes", label: "Observações", icon: NotebookPen },
  { href: "/importar", label: "Importar", icon: Upload },
  { href: "/convites", label: "Convites", icon: UserPlus },
  { href: "/planos", label: "Planos", icon: CreditCard },
  { href: "/organizacoes", label: "Redes de escolas", icon: Building2 },
  { href: "/seguranca", label: "Segurança", icon: ShieldCheck },
];

function isItemActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

/** Conteúdo compartilhado entre a sidebar fixa (desktop) e o drawer mobile (ver MobileNav.tsx) — uma fonte só, dois lugares que a renderizam. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 px-1">
        <OneAvatar size={46} glow float />
        <span className="flex flex-col leading-tight">
          <span className="font-heading text-base font-semibold text-[var(--color-foreground-strong)]">AvaliaSmart</span>
          <span className="text-[11px] font-medium" style={{ color: "var(--color-one)" }}>
            com a One
          </span>
        </span>
      </Link>

      <Link href="/avaliacoes/nova" onClick={onNavigate}>
        <Button variant="gradient" className="w-full justify-center gap-1.5">
          <Plus size={16} /> Nova avaliação
        </Button>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5">
        <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-[var(--color-foreground-faint)] uppercase">Menu</p>
        {NAV_ITEMS.map((item) => {
          const active = isItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium"
              style={{
                backgroundColor: active ? "rgba(139, 147, 242, 0.14)" : "transparent",
                color: active ? "#b8bdf7" : "var(--color-foreground-muted)",
              }}
            >
              <Icon size={17} style={{ color: active ? "var(--color-brand)" : undefined }} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                  style={{ backgroundColor: "rgba(108, 200, 240, 0.16)", color: "var(--color-one)" }}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
        <Link
          href="/chat"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium"
          style={{
            background: "linear-gradient(135deg, rgba(108,200,240,.14), rgba(139,147,242,.12))",
            border: "1px solid rgba(108,200,240,.25)",
            color: "var(--color-foreground-strong)",
          }}
        >
          <Sparkles size={16} style={{ color: "var(--color-one)" }} />
          Falar com a One
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--color-foreground-muted)] hover:text-rose-400"
        >
          <LogOut size={17} /> Sair
        </button>
      </div>
    </div>
  );
}

/** Rail fixo — some abaixo de 900px (ver MobileNav.tsx pro drawer equivalente via Sheet). */
export function Sidebar() {
  return (
    <nav
      className="hidden w-64 shrink-0 border-r min-[900px]:flex"
      style={{ borderColor: "var(--sidebar-border)", backgroundColor: "var(--sidebar)" }}
    >
      <SidebarContent />
    </nav>
  );
}
