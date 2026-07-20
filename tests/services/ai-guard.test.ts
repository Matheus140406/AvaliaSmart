import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiError } from "@/lib/http/api-response";

const subscriptionFindUnique = vi.fn();
const aiUsageLogCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: { findUnique: (...args: unknown[]) => subscriptionFindUnique(...args) },
    aiUsageLog: {
      count: (...args: unknown[]) => aiUsageLogCount(...args),
      create: vi.fn(),
    },
  },
}));

const resolveSubscription = vi.fn();
vi.mock("@/lib/billing/guard", () => ({
  resolveSubscription: (...args: unknown[]) => resolveSubscription(...args),
  paymentRequired: (message: string) => apiError(message, 402),
  inactiveSubscriptionMessage: () => "Assinatura inativa. Regularize em /planos.",
}));

const listActivePlans = vi.fn();
vi.mock("@/repositories/plan.repository", () => ({
  listActivePlans: (...args: unknown[]) => listActivePlans(...args),
  findPlanByTier: vi.fn(),
}));

import { requireAiFeature } from "@/services/ai/guard";

function usableSub(overrides: Record<string, unknown> = {}) {
  return {
    isUsable: true,
    tier: "MENSAL_AVANCADO",
    plan: {
      name: "Avançado",
      tier: "MENSAL_AVANCADO",
      features: { aiAssistant: true, examGenerator: true },
      aiRateLimitMaxCalls: null,
      aiRateLimitWindowHours: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listActivePlans.mockResolvedValue([]);
});

describe("requireAiFeature", () => {
  it("bloqueia com 402 quando o workspace não tem assinatura", async () => {
    resolveSubscription.mockResolvedValue(null);
    const block = await requireAiFeature("t1", "aiAssistant");
    expect(block?.status).toBe(402);
  });

  it("bloqueia com 402 quando a assinatura não está usável", async () => {
    resolveSubscription.mockResolvedValue(usableSub({ isUsable: false }));
    const block = await requireAiFeature("t1", "aiAssistant");
    expect(block?.status).toBe(402);
  });

  it("bloqueia com 402 e cita o plano mínimo quando o flag da feature está desligado", async () => {
    resolveSubscription.mockResolvedValue(
      usableSub({ plan: { ...usableSub().plan, features: { aiAssistant: false } } })
    );
    listActivePlans.mockResolvedValue([
      { name: "Básico", tier: "MENSAL_BASE", features: { aiAssistant: false } },
      { name: "Avançado", tier: "MENSAL_AVANCADO", features: { aiAssistant: true } },
    ]);

    const block = await requireAiFeature("t1", "aiAssistant");
    expect(block?.status).toBe(402);
    const body = await block!.json();
    expect(body.error).toContain("Avançado");
  });

  it("libera quando está sob o teto geral deslizante", async () => {
    resolveSubscription.mockResolvedValue(usableSub());
    aiUsageLogCount.mockResolvedValue(29);
    expect(await requireAiFeature("t1", "aiAssistant")).toBeNull();
  });

  it("bloqueia com 429 ao atingir o teto geral de 30/hora", async () => {
    resolveSubscription.mockResolvedValue(usableSub());
    aiUsageLogCount.mockResolvedValue(30);
    const block = await requireAiFeature("t1", "aiAssistant");
    expect(block?.status).toBe(429);
  });

  it("aplica o teto extra de 8/hora só pra features heavy", async () => {
    resolveSubscription.mockResolvedValue(usableSub());
    // 1ª chamada: teto geral (abaixo). 2ª chamada: contagem heavy (no teto).
    aiUsageLogCount.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
    const block = await requireAiFeature("t1", "examGenerator");
    expect(block?.status).toBe(429);
    expect(aiUsageLogCount).toHaveBeenCalledTimes(2);
  });

  it("não consulta a contagem heavy pra features light", async () => {
    resolveSubscription.mockResolvedValue(usableSub());
    aiUsageLogCount.mockResolvedValue(10);
    expect(await requireAiFeature("t1", "aiAssistant")).toBeNull();
    expect(aiUsageLogCount).toHaveBeenCalledTimes(1);
  });

  it("usa o ciclo próprio do plano NO LUGAR do teto geral quando configurado", async () => {
    resolveSubscription.mockResolvedValue(
      usableSub({
        plan: {
          ...usableSub().plan,
          name: "Básico",
          aiRateLimitMaxCalls: 4,
          aiRateLimitWindowHours: 7,
        },
      })
    );
    // Ciclo atual começou agora e já usou as 4 chamadas.
    subscriptionFindUnique.mockResolvedValue({
      tier: "MENSAL_BASE",
      aiCycleStart: new Date(),
      aiUsedThisCycle: 4,
    });

    const block = await requireAiFeature("t1", "aiAssistant");
    expect(block?.status).toBe(429);
    // Teto geral (aiUsageLog.count) NÃO deve ter sido consultado.
    expect(aiUsageLogCount).not.toHaveBeenCalled();
  });

  it("reseta o ciclo próprio expirado (janela fixa) e libera", async () => {
    resolveSubscription.mockResolvedValue(
      usableSub({
        plan: { ...usableSub().plan, aiRateLimitMaxCalls: 4, aiRateLimitWindowHours: 7 },
      })
    );
    subscriptionFindUnique.mockResolvedValue({
      tier: "MENSAL_BASE",
      aiCycleStart: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8h atrás > janela de 7h
      aiUsedThisCycle: 4,
    });

    expect(await requireAiFeature("t1", "aiAssistant")).toBeNull();
  });
});
