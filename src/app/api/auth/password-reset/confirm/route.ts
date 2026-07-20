import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/http/error-handler";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest } from "@/lib/http/errors";

/**
 * POST /api/auth/password-reset/confirm
 *
 * Mesma regra de senha do cadastro (register/route.ts) — um lugar só pra
 * essa regra seria melhor ainda, mas manter os dois em paralelo já evita a
 * inconsistência mais comum (permitir senha fraca aqui e não lá).
 */

const confirmSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8, "Senha precisa de pelo menos 8 caracteres.")
    .max(72)
    .regex(/[a-zA-Z]/, "Senha precisa de pelo menos uma letra.")
    .regex(/[0-9]/, "Senha precisa de pelo menos um número."),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json().catch(() => null);
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }
  const { token, password } = parsed.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  const invalid =
    !resetToken || resetToken.usedAt !== null || resetToken.expiresAt.getTime() < Date.now();

  if (invalid) {
    throw badRequest("Link inválido ou expirado. Peça um novo reset de senha.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Marca o token como usado e troca a senha juntos — se um falhar, o outro
  // não deve acontecer sozinho (token "gasto" sem senha trocada, ou senha
  // trocada com token reutilizável, são os dois estados ruins).
  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    // Troca de senha é evento de segurança — audita o FATO, nunca o hash.
    // Rota pública (sem tenant/membership): fica só o userId no registro.
    prisma.auditLog.create({
      data: {
        action: "UPDATE",
        model: "User",
        recordId: resetToken.userId,
        newValue: { source: "password-reset", passwordReset: true },
      },
    }),
  ]);

  return apiSuccess({ success: true });
});
