import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { withErrorHandling } from "@/lib/http/error-handler";
import { apiSuccess } from "@/lib/http/api-response";
import { unauthorized, badRequest } from "@/lib/http/errors";
import { verifyMfaChallenge } from "@/services/mfa.service";

const bodySchema = z.object({
  totpCode: z.string().min(1).optional(),
  recoveryCode: z.string().min(1).optional(),
});

/**
 * POST /api/account/mfa/verify-pending — segundo fator pra quem entrou via
 * Google numa conta com MFA ativado (`session.mfaPending`, ver proxy.ts +
 * callback jwt em lib/auth.ts). Diferente do login por senha, aqui a sessão
 * OAuth JÁ existe — só falta confirmar o código antes de liberar o app.
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) throw unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || (!parsed.data.totpCode && !parsed.data.recoveryCode)) {
    throw badRequest("Informe o código do app autenticador ou um código de recuperação.");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mfaEnabled: true, mfaSecretEncrypted: true, mfaRecoveryCodes: true },
  });
  if (!user?.mfaEnabled) throw badRequest("MFA não está ativado nesta conta.");

  const ip = clientIpFromHeaders(request.headers);
  const valid = await verifyMfaChallenge(
    { id: session.user.id, mfaSecretEncrypted: user.mfaSecretEncrypted, mfaRecoveryCodes: user.mfaRecoveryCodes },
    { totpCode: parsed.data.totpCode, recoveryCode: parsed.data.recoveryCode, ip }
  );
  if (!valid) throw badRequest("Código inválido.");

  return apiSuccess({ success: true });
});
