import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Inferido do próprio `prisma.$transaction` (não de `PrismaClient` cru) —
// nosso `prisma` é um client ESTENDIDO (ver lib/prisma.ts), então o tipo do
// `tx` que ele passa pro callback não é exatamente `PrismaClient`.
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Roda `fn` (a mutação de negócio: ativar assinatura, etc.) só se este
 * evento (`gateway` + `eventId`) ainda não tiver sido processado — e faz
 * isso ATOMICAMENTE: o "carimbo" de processado (`WebhookEvent`) e a mutação
 * de negócio vivem na MESMA transação. Se `fn` lançar, a transação inteira
 * dá rollback — inclusive o carimbo — então uma reentrega genuína do
 * gateway (após um erro transitório nosso) consegue reprocessar de verdade.
 * Sem isso, um retry depois de uma falha a meio do caminho seria
 * silenciosamente ignorado como "duplicata" mesmo a mutação nunca tendo
 * acontecido.
 *
 * Devolve `{ processed: false }` se já tinha sido processado antes (gateway
 * reentregou um evento que já tinha concluído com sucesso).
 */
export async function withWebhookIdempotency<T>(
  gateway: string,
  eventId: string,
  fn: (tx: TransactionClient) => Promise<T>
): Promise<{ processed: true; result: T } | { processed: false }> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({ data: { gateway, eventId } });
      return fn(tx);
    });
    return { processed: true, result };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { processed: false };
    }
    throw err;
  }
}
