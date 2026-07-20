import type { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { withErrorHandling } from "@/lib/http/error-handler";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, conflict, HttpError } from "@/lib/http/errors";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { consumeRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

/**
 * POST /api/auth/register — cadastro por e-mail/senha.
 *
 * Rota PÚBLICA de propósito (sem withTenant — o usuário ainda não existe).
 * A validação de senha roda AQUI no servidor, não só no formulário: o client
 * valida pra dar feedback imediato, mas quem garante a regra é esta rota —
 * form client-side é ignorável por qualquer um com curl.
 *
 * Quem entra pelo Google não passa por aqui: o PrismaAdapter do Auth.js cria
 * o User automaticamente no primeiro login OAuth (sem passwordHash — e o
 * provider de credenciais recusa login de conta sem hash, então não há como
 * "chutar senha" de uma conta que só existe via Google).
 */

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nome precisa de pelo menos 2 caracteres.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z
    .string()
    .min(8, "Senha precisa de pelo menos 8 caracteres.")
    .max(72, "Senha pode ter no máximo 72 caracteres.") // limite do bcrypt
    .regex(/[a-zA-Z]/, "Senha precisa de pelo menos uma letra.")
    .regex(/[0-9]/, "Senha precisa de pelo menos um número."),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  // Criação de conta é barata pro atacante e cara pra nós (bcrypt + linha no
  // banco) — 5 cadastros/hora por IP é folga suficiente pra uso legítimo.
  const ip = clientIpFromHeaders(request.headers);
  if (!(await consumeRateLimit(`register:ip:${ip}`, 5, 60 * 60 * 1000))) {
    throw new HttpError(429, "Muitas tentativas de cadastro. Tente novamente em uma hora.");
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.flatten());
  }
  const { name, email, password } = parsed.data;

  // E-mail listado em PLATFORM_ADMIN_EMAILS nunca pode ser registrado por
  // senha: como o cadastro não verifica posse do e-mail, permitir isso
  // deixaria qualquer um "reservar" a conta de um admin da plataforma antes
  // do dono e herdar a visão financeira cross-tenant. Mesma mensagem do caso
  // "conta já existe" de propósito — não confirmar que o e-mail é especial.
  if (isPlatformAdmin(email)) {
    throw conflict("Já existe uma conta com esse e-mail. Tente entrar.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Mensagem idêntica pro caso "existe com senha" e "existe só via Google" —
    // não confirmar qual, pra não vazar quais e-mails têm conta.
    throw conflict("Já existe uma conta com esse e-mail. Tente entrar.");
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await bcrypt.hash(password, 10) },
    select: { id: true, email: true },
  });

  return apiSuccess({ id: user.id, email: user.email }, 201);
});
