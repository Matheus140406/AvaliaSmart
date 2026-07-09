import { prisma } from "@/lib/prisma";
import type { MembershipRole } from "@prisma/client";

export interface CreateInviteInput {
  tenantId: string;
  email: string;
  role: MembershipRole;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
}

export function createInvite(input: CreateInviteInput) {
  return prisma.invite.create({ data: input });
}

export function findInviteByTokenHash(tokenHash: string) {
  return prisma.invite.findUnique({ where: { tokenHash } });
}

export function findInviteById(id: string) {
  return prisma.invite.findUnique({ where: { id } });
}

export function listInvitesForTenant(tenantId: string) {
  return prisma.invite.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true,
      invitedBy: { select: { user: { select: { name: true, email: true } } } },
    },
  });
}

export function countActiveSeats(tenantId: string) {
  return Promise.all([
    prisma.membership.count({ where: { tenantId, active: true } }),
    prisma.invite.count({ where: { tenantId, status: "PENDENTE" } }),
  ]);
}

export function markInviteAccepted(id: string) {
  return prisma.invite.update({ where: { id }, data: { status: "ACEITO", acceptedAt: new Date() } });
}

export function markInviteRevoked(id: string) {
  return prisma.invite.update({ where: { id }, data: { status: "REVOGADO" } });
}
