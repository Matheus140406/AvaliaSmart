import { prisma } from "@/lib/prisma";
import type { PlanTier } from "@prisma/client";

export interface PlanFeatures {
  ocr: boolean;
  aiAssistant: boolean; // resumo de desempenho + sugestão de observação + chat (Etapas 1-3 de IA)
  riskPrediction: boolean;
  advancedExports: boolean;
  prioritySupport: boolean;
  // Expansão de produtividade docente (ver services/ai/feature-registry.ts) —
  // cada chave abaixo é checada individualmente por `requireAiFeature()`,
  // remapeável entre planos só editando esta coluna, sem deploy de código.
  examGenerator: boolean;
  flashcards: boolean;
  lessonPlan: boolean;
  textLevelAdapter: boolean;
  essayGrading: boolean;
  accessibility: boolean;
  imageDescription: boolean;
}

export interface PlanRecord {
  tier: PlanTier;
  name: string;
  durationDays: number;
  maxUsers: number | null;
  maxClasses: number | null;
  maxStudents: number | null;
  maxOcrPerMonth: number | null;
  priceCentsTotal: number;
  priceCentsMonthlyEquiv: number;
  features: PlanFeatures;
  /** Os dois juntos ativam o rate limit de IA em ciclo próprio (ver services/ai/guard.ts); null = usa o teto geral (30/hora). */
  aiRateLimitMaxCalls: number | null;
  aiRateLimitWindowHours: number | null;
}

/**
 * Planos mudam preço/teto sem deploy (moram em `Plan`, não em código), mas
 * são lidos em toda checagem de guard — cache em memória de processo com TTL
 * curto evita 1 query por request sem correr risco de servir preço
 * desatualizado por muito tempo se alguém editar a tabela manualmente.
 */
const CACHE_TTL_MS = 60_000;
let cache: { at: number; plans: Map<PlanTier, PlanRecord> } | null = null;

async function loadPlans(): Promise<Map<PlanTier, PlanRecord>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.plans;

  const rows = await prisma.plan.findMany({ where: { active: true } });
  const plans = new Map<PlanTier, PlanRecord>(
    rows.map((row) => [
      row.tier,
      {
        tier: row.tier,
        name: row.name,
        durationDays: row.durationDays,
        maxUsers: row.maxUsers,
        maxClasses: row.maxClasses,
        maxStudents: row.maxStudents,
        maxOcrPerMonth: row.maxOcrPerMonth,
        priceCentsTotal: row.priceCentsTotal,
        priceCentsMonthlyEquiv: row.priceCentsMonthlyEquiv,
        features: row.features as unknown as PlanFeatures,
        aiRateLimitMaxCalls: row.aiRateLimitMaxCalls,
        aiRateLimitWindowHours: row.aiRateLimitWindowHours,
      },
    ])
  );
  cache = { at: Date.now(), plans };
  return plans;
}

export async function findPlanByTier(tier: PlanTier): Promise<PlanRecord | null> {
  const plans = await loadPlans();
  return plans.get(tier) ?? null;
}

export async function listActivePlans(): Promise<PlanRecord[]> {
  const plans = await loadPlans();
  return [...plans.values()].sort((a, b) => a.priceCentsTotal - b.priceCentsTotal);
}

/** Só pra teste/seed — descarta o cache, útil depois de editar a tabela Plan direto no banco. */
export function invalidatePlanCache(): void {
  cache = null;
}

export function formatPriceCents(cents: number, suffix?: "/mês" | "/ciclo"): string {
  if (cents === 0) return "Grátis";
  const value = (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return suffix ? `${value}${suffix}` : value;
}
