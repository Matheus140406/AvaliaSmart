"use client";

/**
 * Cada clique aqui dispara `update({ activeTenantId })`, que o NextAuth
 * repassa pro callback `jwt` em lib/auth.ts com `trigger === "update"`.
 * O callback resolve a Membership pra esse (userId, tenantId) e a sessão
 * (via callback `session`) passa a carregar `membershipId` + `role` — é isso
 * que o middleware verifica pra liberar o dashboard.
 *
 * `router.replace("/")` resolve para `(dashboard)/page.tsx` (route group,
 * não afeta a URL) — destino válido, confirmado ao vivo.
 */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";
import { OneIcon } from "@/components/one/OneIcon";

export interface WorkspaceOption {
  tenantId: string;
  tenantName: string;
  tenantType: "ESCOLA" | "PROFESSOR_AUTONOMO";
  role: string;
  organization?: { id: string; name: string } | null;
}

/** Agrupa por Organization (preservando a ordem de primeira aparição); workspaces sem organization caem no grupo "avulso" no fim. */
function groupByOrganization(workspaces: WorkspaceOption[]) {
  const groups = new Map<string, { name: string | null; items: WorkspaceOption[] }>();
  for (const w of workspaces) {
    const key = w.organization?.id ?? "__standalone__";
    if (!groups.has(key)) groups.set(key, { name: w.organization?.name ?? null, items: [] });
    groups.get(key)!.items.push(w);
  }
  const entries = [...groups.values()];
  // Grupos com nome (Organization de verdade) primeiro; avulsos por último.
  entries.sort((a, b) => (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0));
  return entries;
}

export default function WorkspaceSwitcher({ workspaces }: { workspaces: WorkspaceOption[] }) {
  const { update } = useSession();
  const router = useRouter();
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectWorkspace = async (tenantId: string) => {
    setPendingTenantId(tenantId);
    setError(null);
    try {
      await update({ activeTenantId: tenantId });
      router.replace("/");
      router.refresh();
    } catch {
      setError("Não foi possível entrar nesse workspace. Tente de novo.");
      setPendingTenantId(null);
    }
  };

  const groups = groupByOrganization(workspaces);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.name ?? "__standalone__"} className="space-y-2">
          {group.name && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-foreground-muted)]">
              {group.name}
            </p>
          )}
          <AnimatedList className="space-y-2" staggerChildren={0.06}>
            {group.items.map((w) => {
              const isPending = pendingTenantId === w.tenantId;
              return (
                <AnimatedListItem key={w.tenantId}>
                  <Button
                    variant="secondary"
                    onClick={() => selectWorkspace(w.tenantId)}
                    disabled={pendingTenantId !== null}
                    className="flex h-auto w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--color-foreground)]">
                        {w.tenantName}
                      </span>
                      <span className="block text-xs text-[var(--color-foreground-muted)]">
                        {w.tenantType === "PROFESSOR_AUTONOMO" ? "Professor autônomo" : "Escola"} · {roleLabel(w.role)}
                      </span>
                    </span>
                    {isPending ? (
                      <OneIcon status="thinking" size={22} label="Entrando…" />
                    ) : (
                      <ChevronRight size={16} className="shrink-0 text-[var(--color-foreground-muted)]" />
                    )}
                  </Button>
                </AnimatedListItem>
              );
            })}
          </AnimatedList>
        </div>
      ))}
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    ADMIN: "Administrador",
    COORDENADOR: "Coordenador",
    PROFESSOR: "Professor",
    ALUNO: "Aluno",
    RESPONSAVEL: "Responsável",
  };
  return labels[role] ?? role;
}
