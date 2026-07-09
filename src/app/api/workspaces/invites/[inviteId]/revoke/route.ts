import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { forbidden } from "@/lib/http/errors";
import { revokeInvite } from "@/services/invite.service";

type RouteContext = { params: Promise<{ inviteId: string }> };

/** POST /api/workspaces/invites/[inviteId]/revoke — ADMIN cancela um convite PENDENTE. */
export const POST = withTenant<RouteContext>(async (_request: NextRequest, user, context) => {
  if (user.role !== "ADMIN") {
    throw forbidden("Só administradores podem revogar convites.");
  }
  const { inviteId } = await context.params;
  const invite = await revokeInvite(user.tenantId, inviteId);
  return apiSuccess({ id: invite.id, status: invite.status });
});
