import type { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { apiError } from "./api-response";
import { HttpError } from "./errors";

/**
 * Error handler global pras rotas PÚBLICAS (sem sessão — register,
 * password-reset, aceite de convite). Rotas autenticadas ganham isso de
 * graça via `withTenant` (ver lib/with-tenant.ts), que já compõe esta mesma
 * lógica.
 *
 * Nunca deixa um erro não tratado (Prisma, bug) vazar stack trace/detalhe
 * interno pro cliente — vira sempre um 500 genérico, com o erro real só no
 * log do servidor.
 */
export function withErrorHandling(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(request);
    } catch (err) {
      if (err instanceof HttpError) {
        return apiError(err.message, err.status, err.details);
      }
      // eslint-disable-next-line no-console
      console.error(`[unhandled] ${request.method} ${request.nextUrl.pathname}:`, err);
      Sentry.captureException(err);
      return apiError("Erro interno. Tente novamente em instantes.", 500);
    }
  };
}
