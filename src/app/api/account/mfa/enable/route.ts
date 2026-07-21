import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/http/error-handler";
import { apiSuccess } from "@/lib/http/api-response";
import { unauthorized, badRequest } from "@/lib/http/errors";
import { confirmMfaSetup } from "@/services/mfa.service";

const bodySchema = z.object({ code: z.string().min(6).max(6) });

/**
 * POST /api/account/mfa/enable — confirma o primeiro código do app
 * autenticador e ativa MFA de verdade (`mfaEnabled=true`). Devolve os
 * códigos de recuperação em texto puro UMA VEZ SÓ — só o hash fica salvo.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) throw unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw badRequest("Código inválido — precisa ter 6 dígitos.");

  const result = await confirmMfaSetup(session.user.id, parsed.data.code);
  return apiSuccess(result);
});
