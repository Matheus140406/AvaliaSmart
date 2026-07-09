"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, LogOut, Repeat } from "lucide-react";
import { TRANSITION_MICRO, TRANSITION_STATE } from "@/lib/motion";

export interface UserMenuProps {
  name: string;
  email: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Avatar + nome + dropdown ("Trocar workspace", "Sair") — identidade do professor logado no AppHeader. */
export function UserMenu({ name, email }: UserMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.97 }}
        transition={TRANSITION_MICRO}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2"
        style={{ backgroundColor: open ? "var(--color-surface-muted)" : "transparent" }}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
          {initialsOf(name)}
        </span>
        <span className="hidden text-sm font-medium text-[var(--color-foreground)] sm:inline">{name}</span>
        <ChevronDown size={14} className="text-[var(--color-foreground-muted)]" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop invisível pra fechar ao clicar fora — mais simples que useOnClickOutside pra este menu pequeno. */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={TRANSITION_STATE}
              data-theme-surface
              className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border shadow-lg"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
            >
              <div className="border-b px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
                <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{name}</p>
                <p className="truncate text-xs text-[var(--color-foreground-muted)]">{email}</p>
              </div>
              <Link
                href="/workspaces"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-surface-muted)]"
              >
                <Repeat size={15} /> Trocar workspace
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-500 hover:bg-[var(--color-surface-muted)]"
              >
                <LogOut size={15} /> Sair
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
