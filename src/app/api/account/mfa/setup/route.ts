import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/http/error-handler";
import { apiSuccess } from "@/lib/http/api-response";
import { unauthorized } from "@/lib/http/errors";
import { startMfaSetup } from "@/services/mfa.service";

/**
 * POST /api/account/mfa/setup — gera um novo segredo TOTP (pendente,
 * `mfaEnabled` só vira true em `/enable` depois do primeiro código
 * confirmado). Sem withTenant: MFA é da conta (`User`), não de um Tenant.
 */
export const POST = withErrorHandling(async (_request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) throw unauthorized();

  const result = await startMfaSetup(session.user.id, session.user.email);
  return apiSuccess(result, 201);
});
