import { randomBytes, createHash } from "node:crypto";
import type { MembershipRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveSubscription } from "@/lib/billing/guard";
import { sendEmail, workspaceInviteEmail } from "@/lib/email/resend";
import { badRequest, conflict, forbidden, paymentRequired } from "@/lib/http/errors";
import {
  createInvite,
  countActiveSeats,
  findInviteByTokenHash,
  listInvitesForTenant,
  markInviteRevoked,
} from "@/repositories/invite.repository";

/** Único ponto que decide quem pode ser convidado — ADMIN nunca, de propósito. */
export const INVITABLE_ROLES: readonly MembershipRole[] = ["COORDENADOR", "PROFESSOR"];

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

const ROLE_LABEL: Record<MembershipRole, string> = {
  ADMIN: "Administrador",
  COORDENADOR: "Coordenador(a)",
  PROFESSOR: "Professor(a)",
  ALUNO: "Aluno",
  RESPONSAVEL: "Responsável",
};

async function assertSeatAvailable(tenantId: string, seatsBeingAdded: number): Promise<void> {
  const sub = await resolveSubscription(tenantId);
  if (!sub) throw paymentRequired("Este workspace não tem uma assinatura. Escolha um plano em /planos.");
  if (!sub.isUsable) {
    throw paymentRequired(
      sub.status === "EXPIRADA" && sub.plan.tier === "TESTE_GRATIS"
        ? "Seu período de teste de 5 dias terminou. Escolha um plano em /planos pra continuar."
        : "A assinatura deste workspace não está ativa. Regularize em /planos."
    );
  }

  const max = sub.plan.maxUsers;
  if (max === null) return;

  const [activeMembers, pendingInvites] = await countActiveSeats(tenantId);
  if (activeMembers + pendingInvites + seatsBeingAdded > max) {
    throw paymentRequired(
      `O plano ${sub.plan.name} permite até ${max} usuário(s) (${activeMembers} ativo(s) + ${pendingInvites} convite(s) pendente(s)). Faça upgrade em /planos pra convidar mais gente.`
    );
  }
}

export interface CreateInviteParams {
  tenantId: string;
  tenantName: string;
  inviterMembershipId: string;
  inviterName: string;
  origin: string;
  email: string;
  role: MembershipRole;
}

export async function createInviteAndNotify(params: CreateInviteParams) {
  const email = params.email.trim().toLowerCase();

  // Checagem de limite acontece AQUI (no envio), não só no aceite — senão
  // dois convites simultâneos furam o teto do plano antes de qualquer um
  // ser aceito.
  await assertSeatAvailable(params.tenantId, 1);

  const alreadyMember = await prisma.membership.findFirst({
    where: { tenantId: params.tenantId, active: true, user: { email } },
  });
  if (alreadyMember) {
    throw conflict("Essa pessoa já faz parte deste workspace.");
  }

  const existingPending = await prisma.invite.findFirst({
    where: { tenantId: params.tenantId, email, status: "PENDENTE" },
  });
  if (existingPending) {
    throw conflict("Já existe um convite pendente para esse e-mail. Revogue-o antes de enviar outro.");
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const invite = await createInvite({
    tenantId: params.tenantId,
    email,
    role: params.role,
    tokenHash,
    invitedById: params.inviterMembershipId,
    expiresAt,
  });

  const acceptUrl = `${params.origin}/convite/aceitar?token=${rawToken}`;
  await sendEmail({
    to: email,
    ...workspaceInviteEmail({
      tenantName: params.tenantName,
      inviterName: params.inviterName,
      acceptUrl,
      roleLabel: ROLE_LABEL[params.role],
    }),
  });

  return invite;
}

export function listInvites(tenantId: string) {
  return listInvitesForTenant(tenantId);
}

export async function revokeInvite(tenantId: string, inviteId: string) {
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.tenantId !== tenantId) {
    throw badRequest("Convite não encontrado.");
  }
  if (invite.status !== "PENDENTE") {
    throw badRequest(`Convite já está ${invite.status.toLowerCase()} — nada a revogar.`);
  }
  return markInviteRevoked(inviteId);
}

export interface AcceptInviteParams {
  rawToken: string;
  sessionUserId: string;
  sessionEmail: string;
}

export async function acceptInvite(params: AcceptInviteParams) {
  const tokenHash = createHash("sha256").update(params.rawToken).digest("hex");
  const invite = await findInviteByTokenHash(tokenHash);

  if (!invite) {
    throw badRequest("Convite inválido.");
  }
  if (invite.status === "ACEITO") {
    // Idempotente: aceitar de novo (ex: clique duplo no link) não deve dar erro.
    const existing = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: params.sessionUserId, tenantId: invite.tenantId } },
    });
    if (existing) return { tenantId: invite.tenantId, membershipId: existing.id };
  }
  if (invite.status !== "PENDENTE") {
    throw badRequest(`Este convite já está ${invite.status.toLowerCase()}.`);
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.invite.update({ where: { id: invite.id }, data: { status: "EXPIRADO" } });
    throw badRequest("Este convite expirou. Peça pra ser convidado(a) de novo.");
  }
  if (invite.email.toLowerCase() !== params.sessionEmail.toLowerCase()) {
    throw forbidden("Este convite foi enviado pra outro e-mail — entre com a conta correta.");
  }

  // Re-checa o teto na hora do aceite também (belt-and-suspenders): entre o
  // envio e o aceite, o tenant pode ter mudado de plano ou aceitado outro
  // convite concorrente.
  await assertSeatAvailable(invite.tenantId, 1);

  const result = await prisma.$transaction(async (tx) => {
    const membership = await tx.membership.create({
      data: { userId: params.sessionUserId, tenantId: invite.tenantId, role: invite.role },
    });
    await tx.invite.update({ where: { id: invite.id }, data: { status: "ACEITO", acceptedAt: new Date() } });
    return membership;
  });

  return { tenantId: result.tenantId, membershipId: result.id };
}
