import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const createWebhookEvent = vi.fn();
const $transaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // O código de produção chama prisma.$transaction(fn) e, dentro dele,
    // tx.webhookEvent.create + a mutação de negócio. O mock roda o callback
    // com um tx fake — comportamento transacional (rollback) é simulado
    // propagando o throw, igual o Prisma faz.
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      $transaction(fn) ?? fn({ webhookEvent: { create: createWebhookEvent } }),
  },
}));

import { withWebhookIdempotency } from "@/lib/billing/webhook-idempotency";

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.0.0",
  });
}

beforeEach(() => {
  createWebhookEvent.mockReset();
  $transaction.mockReset();
});

describe("withWebhookIdempotency", () => {
  it("processa evento novo e devolve o resultado da mutação", async () => {
    createWebhookEvent.mockResolvedValue({});
    const fn = vi.fn().mockResolvedValue("mutado");

    const outcome = await withWebhookIdempotency("mercadopago", "evt-1", fn);

    expect(outcome).toEqual({ processed: true, result: "mutado" });
    expect(createWebhookEvent).toHaveBeenCalledWith({
      data: { gateway: "mercadopago", eventId: "evt-1" },
    });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("devolve processed:false em evento duplicado (P2002) sem rodar a mutação", async () => {
    createWebhookEvent.mockRejectedValue(uniqueViolation());
    const fn = vi.fn();

    const outcome = await withWebhookIdempotency("asaas", "evt-dup", fn);

    expect(outcome).toEqual({ processed: false });
    expect(fn).not.toHaveBeenCalled();
  });

  it("propaga erro da mutação (transação inteira dá rollback e o gateway pode reentregar)", async () => {
    createWebhookEvent.mockResolvedValue({});
    const boom = new Error("falha transitória");
    const fn = vi.fn().mockRejectedValue(boom);

    await expect(withWebhookIdempotency("asaas", "evt-2", fn)).rejects.toThrow("falha transitória");
  });

  it("propaga erros conhecidos do Prisma que NÃO sejam P2002", async () => {
    createWebhookEvent.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("FK inválida", { code: "P2003", clientVersion: "7.0.0" })
    );
    await expect(withWebhookIdempotency("asaas", "evt-3", vi.fn())).rejects.toThrow("FK inválida");
  });
});
