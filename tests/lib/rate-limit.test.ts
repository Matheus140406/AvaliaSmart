import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
const create = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rateLimitEvent: {
      count: (...args: unknown[]) => count(...args),
      create: (...args: unknown[]) => create(...args),
      deleteMany: (...args: unknown[]) => deleteMany(...args),
    },
  },
}));

import { consumeRateLimit, pruneRateLimitEvents, clientIpFromHeaders } from "@/lib/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("consumeRateLimit", () => {
  it("permite e registra a tentativa quando está abaixo do limite", async () => {
    count.mockResolvedValue(4);
    create.mockResolvedValue({});

    expect(await consumeRateLimit("login:ip:1.2.3.4", 5, 60_000)).toBe(true);
    expect(create).toHaveBeenCalledWith({ data: { key: "login:ip:1.2.3.4" } });
  });

  it("bloqueia SEM registrar quando o limite foi atingido", async () => {
    count.mockResolvedValue(5);

    expect(await consumeRateLimit("login:ip:1.2.3.4", 5, 60_000)).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("conta só a janela deslizante (filtro por createdAt >= agora - janela)", async () => {
    count.mockResolvedValue(0);
    create.mockResolvedValue({});
    const before = Date.now();

    await consumeRateLimit("k", 5, 15 * 60 * 1000);

    const where = count.mock.calls[0][0].where;
    expect(where.key).toBe("k");
    const gte = (where.createdAt.gte as Date).getTime();
    expect(gte).toBeGreaterThanOrEqual(before - 15 * 60 * 1000 - 1000);
    expect(gte).toBeLessThanOrEqual(Date.now() - 15 * 60 * 1000 + 1000);
  });

  it("faz fail-open (permite) se o banco falhar — o limiter não pode derrubar o login", async () => {
    count.mockRejectedValue(new Error("db fora"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await consumeRateLimit("k", 5, 60_000)).toBe(true);
    spy.mockRestore();
  });
});

describe("pruneRateLimitEvents", () => {
  it("deleta eventos com mais de 24h e devolve a contagem", async () => {
    deleteMany.mockResolvedValue({ count: 12 });
    expect(await pruneRateLimitEvents()).toBe(12);

    const cutoff = (deleteMany.mock.calls[0][0].where.createdAt.lt as Date).getTime();
    expect(Date.now() - cutoff).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
  });
});

describe("clientIpFromHeaders", () => {
  it("usa o primeiro IP do x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.9");
  });

  it("agrupa como 'unknown' sem o header", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});
