import type { NextRequest } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail, passwordResetEmail } from "@/lib/email/resend";
import { withErrorHandling } from "@/lib/http/error-handler";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, HttpError } from "@/lib/http/errors";
import { consumeRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

/**
 * POST /api/auth/password-reset/request
 *
 * Requisitos de segurança que valem destacar (pedidos explicitamente):
 * - Token é `randomBytes(32)` — 256 bits de entropia aleatória de verdade,
 *   nunca sequencial ou derivado de algo previsível (id incremental, timestamp).
 * - Só o HASH (sha256) do token fica no banco — o token em si só existe no
 *   e-mail. Vazamento do banco não dá reset de senha de ninguém.
 * - Pedir um novo reset invalida TODOS os tokens anteriores não usados do
 *   mesmo usuário (`usedAt` marcado) — nunca existe mais de um link válido
 *   "esquecido" por aí ao mesmo tempo.
 * - Resposta é IDÊNTICA exista ou não o e-mail — não dá pra usar esse
 *   endpoint pra descobrir quais e-mails têm conta (enumeration).
 */

const requestSchema = z.object({ email: z.string().trim().toLowerCase().email() });

const GENERIC_MESSAGE = "Se esse e-mail tiver uma conta, enviamos um link de redefinição.";

export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("E-mail inválido.");
  }

  // Cada chamada com conta existente dispara um e-mail real (Resend) — sem
  // freio, isso é bombardeio de caixa de entrada da vítima + consumo da
  // nossa cota. Limita por IP e por e-mail-alvo; o 429 não vaza se a conta
  // existe (dispara igual pra e-mail com e sem conta).
  const ip = clientIpFromHeaders(request.headers);
  const [ipAllowed, emailAllowed] = await Promise.all([
    consumeRateLimit(`pwreset:ip:${ip}`, 10, 60 * 60 * 1000),
    consumeRateLimit(`pwreset:email:${parsed.data.email}`, 3, 60 * 60 * 1000),
  ]);
  if (!ipAllowed || !emailAllowed) {
    throw new HttpError(429, "Muitos pedidos de redefinição. Tente novamente em uma hora.");
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  // Mesma resposta com ou sem conta — sem isso, o endpoint vira um oráculo
  // de "quais e-mails existem no sistema".
  if (!user) {
    return apiSuccess({ message: GENERIC_MESSAGE });
  }

  // Invalida qualquer token anterior ainda válido antes de emitir um novo.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
    },
  });

  const resetUrl = `${request.nextUrl.origin}/redefinir-senha?token=${rawToken}`;
  await sendEmail({ to: user.email, ...passwordResetEmail({ resetUrl }) });

  return apiSuccess({ message: GENERIC_MESSAGE });
});
