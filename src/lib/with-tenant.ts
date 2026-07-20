import type { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { runWithTenantContext } from "@/lib/tenant-context";
import { apiError } from "@/lib/http/api-response";
import { HttpError } from "@/lib/http/errors";

/**
 * Substitui o padrão repetido em toda rota:
 *   const user = await getCurrentUser();
 *   if (!user) return 401;
 *   ...
 * por:
 *   export const POST = withTenant((request, user) => { ... });
 *
 * E, a mais, entra no contexto do AsyncLocalStorage — então qualquer query
 * Prisma feita dentro do handler (direta ou indiretamente, via serialize.ts
 * etc.) já passa pelo filtro automático de tenant da Client Extension em
 * `lib/prisma.ts`, sem precisar repassar `tenantId` manualmente.
 *
 * Isso é uma camada A MAIS, não uma substituição: os checks explícitos de
 * tenantId que já existem em cada rota continuam lá — a extension cobre
 * findMany/findFirst/updateMany/deleteMany, mas não findUnique/update/delete
 * (ver comentário em lib/prisma.ts sobre por quê).
 *
 * Também é o error handler global das rotas autenticadas: qualquer `throw`
 * dentro do handler é capturado aqui — `HttpError` vira a resposta padrão
 * `{success:false, error}`; qualquer outra exceção (bug, erro do Prisma) vira
 * 500 genérico, com o erro real só no log do servidor, nunca no response.
 *
 * `context` é repassado igual o Next.js manda pra rota (contém `params` de
 * segmentos dinâmicos, ex.: `[inviteId]`) — precisa do genérico porque cada
 * rota dinâmica tem um shape de `params` diferente.
 */
export function withTenant<Context = unknown>(
  handler: (request: NextRequest, user: SessionUser, context: Context) => Promise<NextResponse>
) {
  return async (request: NextRequest, context: Context): Promise<NextResponse> => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        return apiError("Não autenticado.", 401);
      }
      // Na Vercel, x-forwarded-for é preenchido pela plataforma (primeiro IP =
      // cliente real). User-Agent vem direto do navegador. Ambos alimentam o
      // AuditLog automático — ver a extension em lib/prisma.ts.
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
      const userAgent = request.headers.get("user-agent") ?? undefined;

      return await runWithTenantContext(
        { tenantId: user.tenantId, membershipId: user.id, ip, userAgent },
        () => handler(request, user, context)
      );
    } catch (err) {
      if (err instanceof HttpError) {
        return apiError(err.message, err.status, err.details);
      }
      // eslint-disable-next-line no-console
      console.error(`[unhandled] ${request.method} ${request.nextUrl.pathname}:`, err);
      // Só erro de verdade (bug, falha do Prisma) vai pro Sentry — HttpError
      // é fluxo de negócio esperado (403, 404, 409...), não incidente.
      Sentry.captureException(err);
      return apiError("Erro interno. Tente novamente em instantes.", 500);
    }
  };
}
