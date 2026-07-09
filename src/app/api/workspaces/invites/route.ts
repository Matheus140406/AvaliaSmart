import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { forbidden, badRequest } from "@/lib/http/errors";
import { createInviteAndNotify, listInvites, INVITABLE_ROLES } from "@/services/invite.service";

/**
 * POST /api/workspaces/invites — ADMIN convida alguém pro workspace por
 * e-mail (COORDENADOR ou PROFESSOR — nunca ADMIN, ver invite.service.ts).
 * GET  /api/workspaces/invites — lista os convites do tenant (qualquer
 * status), pro ADMIN acompanhar/revogar.
 */

const createInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(INVITABLE_ROLES as [string, ...string[]]),
});

export const POST = withTenant(async (request: NextRequest, user) => {
  if (user.role !== "ADMIN") {
    throw forbidden("Só administradores podem convidar membros.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createInviteSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.flatten());
  }

  const [tenant, inviter] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } }),
    prisma.membership.findUnique({ where: { id: user.id }, include: { user: true } }),
  ]);

  const invite = await createInviteAndNotify({
    tenantId: user.tenantId,
    tenantName: tenant?.name ?? "AvaliaSmart",
    inviterMembershipId: user.id,
    inviterName: inviter?.user.name ?? inviter?.user.email ?? "Um administrador",
    origin: request.nextUrl.origin,
    email: parsed.data.email,
    role: parsed.data.role as "COORDENADOR" | "PROFESSOR",
  });

  return apiSuccess(
    { id: invite.id, email: invite.email, role: invite.role, status: invite.status, expiresAt: invite.expiresAt },
    201
  );
});

export const GET = withTenant(async (_request: NextRequest, user) => {
  if (user.role !== "ADMIN") {
    throw forbidden("Só administradores podem ver os convites.");
  }
  const invites = await listInvites(user.tenantId);
  return apiSuccess(invites);
});
