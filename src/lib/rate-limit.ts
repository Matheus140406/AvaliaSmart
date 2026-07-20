import { prisma } from "@/lib/prisma";

/**
 * Rate limit de janela deslizante persistido em Postgres — ver o comentário
 * do model `RateLimitEvent` no schema pra justificativa (serverless: memória
 * não compartilha entre instâncias; o banco é o único estado comum já
 * existente, sem precisar de Redis novo).
 *
 * FAIL-OPEN deliberado: se o banco engasgar na contagem, a resposta é
 * "permitido" — indisponibilidade do limiter não pode derrubar o login
 * inteiro. O objetivo é frear brute force/abuso, não ser uma barreira
 * infalível.
 */
export async function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - windowMs);
    const recent = await prisma.rateLimitEvent.count({
      where: { key, createdAt: { gte: windowStart } },
    });
    if (recent >= max) {
      return false;
    }
    await prisma.rateLimitEvent.create({ data: { key } });
    return true;
  } catch (err) {
    console.error("[rate-limit] falha ao consultar/registrar tentativa — liberando (fail-open):", err);
    return true;
  }
}

/** Varre eventos com mais de 24h — nenhuma janela usada chega perto disso. Chamado pelo cron diário. */
export async function pruneRateLimitEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { count } = await prisma.rateLimitEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}

/** Primeiro IP do x-forwarded-for (na Vercel, o cliente real) — "unknown" agrupa o que não der pra identificar. */
export function clientIpFromHeaders(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
