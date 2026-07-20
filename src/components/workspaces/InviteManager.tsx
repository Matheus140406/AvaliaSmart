"use client";

/**
 * Admin de convites — a única superfície que faltava pras rotas de
 * /api/workspaces/invites* (criar/listar/revogar já existiam, sem tela
 * nenhuma pra chamá-las; só o accept, via link do e-mail, tinha UI).
 * Papel convidável é COORDENADOR ou PROFESSOR (nunca ADMIN — ver
 * INVITABLE_ROLES em services/invite.service.ts); a rota já garante isso no
 * servidor, o `<select>` só evita a pessoa digitar um papel inválido.
 */

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AnimatedCard, AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";

type InviteRole = "COORDENADOR" | "PROFESSOR";
type InviteStatus = "PENDENTE" | "ACEITO" | "EXPIRADO" | "REVOGADO";

interface InviteItem {
  id: string;
  email: string;
  role: InviteRole;
  status: InviteStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  invitedBy: { user: { name: string | null; email: string } } | null;
}

const ROLE_LABEL: Record<InviteRole, string> = {
  COORDENADOR: "Coordenador(a)",
  PROFESSOR: "Professor(a)",
};

const STATUS_LABEL: Record<InviteStatus, string> = {
  PENDENTE: "Pendente",
  ACEITO: "Aceito",
  EXPIRADO: "Expirado",
  REVOGADO: "Revogado",
};

const STATUS_COLOR: Record<InviteStatus, string> = {
  PENDENTE: "text-amber-600",
  ACEITO: "text-emerald-600",
  EXPIRADO: "text-[var(--color-foreground-muted)]",
  REVOGADO: "text-[var(--color-foreground-muted)]",
};

export function InviteManager({ initialInvites }: { initialInvites: InviteItem[] }) {
  const [invites, setInvites] = useState<InviteItem[]>(initialInvites);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("PROFESSOR");
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível enviar o convite.");
      setInvites((prev) => [
        {
          id: body.data.id,
          email: body.data.email,
          role: body.data.role,
          status: body.data.status,
          expiresAt: body.data.expiresAt,
          acceptedAt: null,
          createdAt: new Date().toISOString(),
          invitedBy: null,
        },
        ...prev,
      ]);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar convite.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    setRevokingId(inviteId);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/invites/${inviteId}/revoke`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível revogar o convite.");
      setInvites((prev) => prev.map((i) => (i.id === inviteId ? { ...i, status: "REVOGADO" } : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao revogar convite.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <AnimatedCard
        className="space-y-3 rounded-lg border p-4"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <form onSubmit={handleCreate} className="flex flex-wrap gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e-mail@exemplo.com"
            required
            className="input-field h-9 min-w-[220px] flex-1 rounded-md px-3 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as InviteRole)}
            className="input-field h-9 rounded-md px-3 text-sm"
          >
            <option value="PROFESSOR">Professor(a)</option>
            <option value="COORDENADOR">Coordenador(a)</option>
          </select>
          <Button type="submit" disabled={creating}>
            {creating ? "Enviando…" : "Convidar"}
          </Button>
        </form>
        {error && <p className="text-xs text-rose-500">{error}</p>}
      </AnimatedCard>

      {invites.length === 0 ? (
        <p className="text-sm text-[var(--color-foreground-muted)]">Nenhum convite enviado ainda.</p>
      ) : (
        <AnimatedList className="space-y-2" staggerChildren={0.04}>
          {invites.map((invite) => (
            <AnimatedListItem key={invite.id}>
              <div
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-foreground)]">{invite.email}</p>
                  <p className="text-xs text-[var(--color-foreground-muted)]">
                    {ROLE_LABEL[invite.role]} ·{" "}
                    <span className={STATUS_COLOR[invite.status]}>{STATUS_LABEL[invite.status]}</span>
                  </p>
                </div>
                {invite.status === "PENDENTE" && (
                  <Button
                    variant="ghost"
                    onClick={() => handleRevoke(invite.id)}
                    disabled={revokingId === invite.id}
                    className="h-7 shrink-0 px-2 text-xs text-rose-500"
                  >
                    {revokingId === invite.id ? "Revogando…" : "Revogar"}
                  </Button>
                )}
              </div>
            </AnimatedListItem>
          ))}
        </AnimatedList>
      )}
    </div>
  );
}
