import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listInvites } from "@/services/invite.service";
import { InviteManager } from "@/components/workspaces/InviteManager";

/**
 * `/convites` — admin de convites (Etapa de finalização): as rotas
 * `/api/workspaces/invites*` (criar/listar/revogar) já existiam prontas,
 * sem tela nenhuma que as chamasse — só o aceite (via link do e-mail) tinha
 * UI. Só ADMIN pode convidar/revogar (mesma regra das rotas); quem não é
 * ADMIN vê a página com um aviso, não um 404 — o item de nav é visível a
 * todos, mas só é útil pro admin do workspace.
 */
export default async function ConvitesPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  if (user.role !== "ADMIN") {
    return (
      <div className="p-6">
        <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Convites</h1>
        <p className="text-sm text-[var(--color-foreground-muted)]">
          Somente administradores do workspace podem convidar ou revogar membros.
        </p>
      </div>
    );
  }

  const invites = await listInvites(user.tenantId);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
      <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Convites</h1>
      <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">
        Convide coordenadores e professores pro workspace por e-mail. Convites pendentes expiram em 48h.
      </p>

      <InviteManager
        initialInvites={invites.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role as "COORDENADOR" | "PROFESSOR",
          status: i.status,
          expiresAt: i.expiresAt.toISOString(),
          acceptedAt: i.acceptedAt?.toISOString() ?? null,
          createdAt: i.createdAt.toISOString(),
          invitedBy: i.invitedBy ? { user: i.invitedBy.user } : null,
        }))}
      />
    </div>
  );
}
