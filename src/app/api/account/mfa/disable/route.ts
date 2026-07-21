import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/http/error-handler";
import { apiSuccess } from "@/lib/http/api-response";
import { unauthorized, badRequest } from "@/lib/http/errors";
import { disableMfa } from "@/services/mfa.service";

const bodySchema = z.object({ password: z.string().min(1) });

/**
 * POST /api/account/mfa/disable — exige a senha atual (re-autenticação),
 * não só a sessão — desligar MFA é sensível o bastante pra não bastar um
 * cookie de sessão já aberto (ex: dispositivo esquecido logado).
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) throw unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw badRequest("Senha é obrigatória.");

  await disableMfa(session.user.id, parsed.data.password);
  return apiSuccess({ success: true });
});
