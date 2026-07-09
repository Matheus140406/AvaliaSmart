import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/http/error-handler";
import { apiSuccess } from "@/lib/http/api-response";
import { unauthorized, badRequest } from "@/lib/http/errors";
import { acceptInvite } from "@/services/invite.service";

/**
 * POST /api/workspaces/invites/accept — quem recebeu o convite por e-mail
 * já precisa estar logado (senha própria ou Google) com o MESMO e-mail
 * convidado; essa rota só liga a Membership. Não usa `withTenant` porque a
 * pessoa pode não ter tenant nenhum ainda (primeiro convite da vida dela).
 */

const acceptSchema = z.object({ token: z.string().min(1) });

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw unauthorized("Entre com sua conta (e-mail convidado) antes de aceitar o convite.");
  }

  const body = await request.json().catch(() => null);
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Token de convite ausente ou inválido.");
  }

  const result = await acceptInvite({
    rawToken: parsed.data.token,
    sessionUserId: session.user.id,
    sessionEmail: session.user.email,
  });

  return apiSuccess(result);
});
