import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveSubscription, paymentRequired, inactiveSubscriptionMessage } from "@/lib/billing/guard";
import { apiError } from "@/lib/http/api-response";
import { listActivePlans, findPlanByTier } from "@/repositories/plan.repository";
import type { AiFeature } from "@prisma/client";
import { AI_FEATURE_REGISTRY, HEAVY_USAGE_LOG_FEATURES, type AiFeatureFlag } from "./feature-registry";

/**
 * Guard central de TODAS as rotas de IA — resumo/sugestão/chat (já
 * existentes) e as 7 novas de produtividade docente (Etapa 0 da expansão).
 *
 * Três checagens, nessa ordem — devolve `NextResponse | null` no mesmo
 * padrão dos outros guards de billing (`if (block) return block;` na rota):
 *
 * 1. Assinatura usável (mesma regra de sempre).
 * 2. Plano tem o flag da feature específica em `Plan.features` (ver
 *    services/ai/feature-registry.ts) — mensagem de bloqueio padronizada,
 *    com o nome do plano calculado NA HORA a partir da tabela `Plan` (nunca
 *    hard-coded), pra continuar certa mesmo se você remapear os planos
 *    depois sem deploy.
 * 3. Rate limit em duas camadas: um teto geral (todas as features somadas)
 *    e um teto extra, mais apertado, só pras features "heavy" (saída bem
 *    maior — prova, plano de aula, correção de redação, descrição de
 *    imagem). Ver Etapa 9 do relatório pra justificativa dos números.
 */

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hora
const RATE_LIMIT_MAX_CALLS = 30; // por tenant, somando TODAS as features de IA
const HEAVY_RATE_LIMIT_MAX_CALLS = 8; // por tenant, só as features "heavy" (subconjunto do teto geral)

/** Nome do plano mais barato que hoje tem essa feature ligada — null se nenhum plano ativo tem. */
async function minimumPlanNameForFeature(feature: AiFeatureFlag): Promise<string | null> {
  const plans = await listActivePlans(); // já vem ordenado por preço crescente
  const match = plans.find((p) => p.features[feature]);
  return match?.name ?? null;
}

/** Próximo plano (por preço) que JÁ NÃO usa ciclo próprio de IA — é o upgrade natural pra sair do limite apertado. */
async function nextPlanNameWithoutCycleLimit(currentTier: string): Promise<string | null> {
  const plans = await listActivePlans();
  const currentIndex = plans.findIndex((p) => p.tier === currentTier);
  const upgrade = plans.slice(currentIndex + 1).find((p) => p.aiRateLimitMaxCalls === null);
  return upgrade?.name ?? null;
}

/**
 * Rate limit de IA em CICLO PRÓPRIO (janela FIXA, não deslizante) — mesmo
 * padrão de `requireOcrCapacity`/`recordOcrUsage` em lib/billing/guard.ts
 * (contador + timestamp de início persistidos em `Subscription`, reset
 * preguiçoso na leitura). Janela FIXA escolhida de propósito (não
 * deslizante como o teto geral de 30/hora): o pedido fala em "ciclo" que
 * "começa" e "libera de novo" num horário certo — isso é o comportamento
 * de uma janela fixa, e reaproveitar o padrão já usado pro OCR evita um
 * terceiro mecanismo de contagem diferente no mesmo arquivo.
 */
async function checkPlanCycleRateLimit(
  tenantId: string,
  maxCalls: number,
  windowHours: number,
  planName: string
): Promise<NextResponse | null> {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub) return null; // resolveSubscription já validou que existe — defensivo, não deveria acontecer.

  const windowMs = windowHours * 60 * 60 * 1000;
  const cycleExpired = Date.now() - sub.aiCycleStart.getTime() > windowMs;
  const used = cycleExpired ? 0 : sub.aiUsedThisCycle;

  if (used >= maxCalls) {
    const releasesAt = new Date((cycleExpired ? Date.now() : sub.aiCycleStart.getTime()) + windowMs);
    const releasesAtLabel = releasesAt.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
    const upgradeName = await nextPlanNameWithoutCycleLimit(sub.tier);
    const upgradeCta = upgradeName ? ` Faça upgrade pra ${upgradeName} em /planos pra ter mais perguntas por hora.` : " Veja outros planos em /planos.";
    return apiError(
      `Limite de ${maxCalls} perguntas de IA do plano ${planName} atingido — libera de novo às ${releasesAtLabel}.${upgradeCta}`,
      429
    );
  }
  return null;
}

/** Incrementa o contador do ciclo próprio de IA — chamar só quando o plano usa esse modo (ver `recordAiUsage`). Reset preguiçoso igual à checagem acima. */
async function incrementPlanCycleUsage(tenantId: string, windowHours: number): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub) return;

  const windowMs = windowHours * 60 * 60 * 1000;
  const cycleExpired = Date.now() - sub.aiCycleStart.getTime() > windowMs;
  await prisma.subscription.update({
    where: { tenantId },
    data: cycleExpired ? { aiUsedThisCycle: 1, aiCycleStart: new Date() } : { aiUsedThisCycle: { increment: 1 } },
  });
}

export async function requireAiFeature(tenantId: string, feature: AiFeatureFlag): Promise<NextResponse | null> {
  const sub = await resolveSubscription(tenantId);
  if (!sub) {
    return paymentRequired("Este workspace não tem uma assinatura. Escolha um plano em /planos.");
  }
  if (!sub.isUsable) {
    return paymentRequired(inactiveSubscriptionMessage(sub));
  }
  if (!sub.plan.features[feature]) {
    const minPlanName = await minimumPlanNameForFeature(feature);
    return paymentRequired(
      minPlanName
        ? `Funcionalidade disponível a partir do plano ${minPlanName}.`
        : "Funcionalidade não disponível em nenhum plano ativo no momento."
    );
  }

  // Plano com ciclo próprio configurado (ex: Mensal Base = 4/7h) usa esse
  // teto NO LUGAR do geral (30/hora deslizante) — os dois nunca se somam.
  // Planos sem os dois campos preenchidos (Avançado/Trimestral/Semestral,
  // por enquanto) caem no `else` e mantêm o comportamento de sempre,
  // intacto.
  if (sub.plan.aiRateLimitMaxCalls !== null && sub.plan.aiRateLimitWindowHours !== null) {
    const cycleBlock = await checkPlanCycleRateLimit(tenantId, sub.plan.aiRateLimitMaxCalls, sub.plan.aiRateLimitWindowHours, sub.plan.name);
    if (cycleBlock) return cycleBlock;
    // Sem checagem "heavy" separada aqui de propósito: o teto geral do
    // ciclo próprio (ex: 4/7h) já é bem mais apertado que
    // `HEAVY_RATE_LIMIT_MAX_CALLS` (8/hora) — a checagem heavy nunca
    // dispararia antes do teto geral do plano de qualquer forma.
  } else {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const totalRecent = await prisma.aiUsageLog.count({
      where: { tenantId, createdAt: { gte: windowStart } },
    });
    if (totalRecent >= RATE_LIMIT_MAX_CALLS) {
      return apiError(
        `Limite de ${RATE_LIMIT_MAX_CALLS} chamadas de IA por hora atingido para este workspace. Tente novamente em instantes.`,
        429
      );
    }

    if (AI_FEATURE_REGISTRY[feature].weight === "heavy") {
      const heavyRecent = await prisma.aiUsageLog.count({
        where: { tenantId, createdAt: { gte: windowStart }, feature: { in: HEAVY_USAGE_LOG_FEATURES } },
      });
      if (heavyRecent >= HEAVY_RATE_LIMIT_MAX_CALLS) {
        return apiError(
          `Limite de ${HEAVY_RATE_LIMIT_MAX_CALLS} chamadas de operações pesadas de IA (provas, plano de aula, correção de redação, descrição de imagem) por hora atingido para este workspace. Tente novamente em instantes.`,
          429
        );
      }
    }
  }

  return null;
}

/** Mantido pelas 3 rotas de IA já existentes (resumo/sugestão/chat) — mesmo comportamento de antes, agora via o guard genérico. */
export async function requireAiAccess(tenantId: string): Promise<NextResponse | null> {
  return requireAiFeature(tenantId, "aiAssistant");
}

export async function recordAiUsage(params: {
  tenantId: string;
  membershipId: string;
  feature: AiFeature;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<void> {
  await prisma.aiUsageLog.create({
    data: {
      tenantId: params.tenantId,
      membershipId: params.membershipId,
      feature: params.feature,
      success: params.success,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
    },
  });

  // Incrementa o contador de ciclo próprio também (independente de sucesso
  // — a tentativa já consumiu uma chamada de IA de verdade, mesmo que a
  // resposta tenha falhado; mesmo critério do teto geral de 30/hora, que
  // também conta tentativa com falha).
  const sub = await prisma.subscription.findUnique({ where: { tenantId: params.tenantId } });
  if (!sub) return;
  const plan = await findPlanByTier(sub.tier);
  if (plan && plan.aiRateLimitMaxCalls !== null && plan.aiRateLimitWindowHours !== null) {
    await incrementPlanCycleUsage(params.tenantId, plan.aiRateLimitWindowHours);
  }
}
