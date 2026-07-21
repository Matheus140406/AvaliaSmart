import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/http/error-handler";
import { apiSuccess } from "@/lib/http/api-response";
import { unauthorized } from "@/lib/http/errors";

/** GET /api/account/mfa — status atual (ativado ou não) pra tela de configurações. */
export const GET = withErrorHandling(async () => {
  const session = await auth();
  if (!session?.user?.id) throw unauthorized();

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { mfaEnabled: true } });
  return apiSuccess({ mfaEnabled: user?.mfaEnabled ?? false });
});
