import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/api-response";
import { findPlanByTier, type PlanFeatures, type PlanRecord } from "@/repositories/plan.repository";

/**
 * Guard de assinatura, usado pelas rotas que dependem de plano.
 *
 * `resolveSubscription` trata a expiração do trial de forma preguiçosa
 * (lazy): não existe cron marcando trials como expirados só pra isso — a
 * checagem `trialEndsAt < now` acontece na leitura, e a primeira leitura
 * após o vencimento também persiste status = EXPIRADA. (O cron diário —
 * ver api/cron/check-expiring-subscriptions — cobre a expiração de
 * assinaturas PAGAS, que não têm trialEndsAt.)
 */

export interface EffectiveSubscription {
  plan: PlanRecord;
  status: "ATIVA" | "EXPIRADA" | "CANCELADA" | "INADIMPLENTE";
  trialEndsAt: Date | null;
  isUsable: boolean; // ATIVA e (se trial) dentro do prazo
}

export async function resolveSubscription(tenantId: string): Promise<EffectiveSubscription | null> {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub) return null;

  const plan = await findPlanByTier(sub.tier);
  if (!plan) return null; // plano desativado/removido do catálogo — trata como sem assinatura

  let status = sub.status as EffectiveSubscription["status"];

  const trialExpired =
    sub.tier === "TESTE_GRATIS" && sub.trialEndsAt !== null && sub.trialEndsAt.getTime() < Date.now();

  if (trialExpired && status === "ATIVA") {
    status = "EXPIRADA";
    // Persiste a expiração na primeira leitura pós-vencimento (best-effort).
    prisma.subscription
      .update({ where: { id: sub.id }, data: { status: "EXPIRADA" } })
      .catch(() => {});
  }

  return {
    plan,
    status,
    trialEndsAt: sub.trialEndsAt,
    isUsable: status === "ATIVA",
  };
}

/** Resposta padrão pra plano insuficiente/vencido — HTTP 402, no envelope padrão da API. */
export function paymentRequired(message: string): NextResponse {
  return apiError(message, 402);
}

export function inactiveSubscriptionMessage(sub: EffectiveSubscription): string {
  return sub.status === "EXPIRADA" && sub.plan.tier === "TESTE_GRATIS"
    ? "Seu período de teste de 5 dias terminou. Escolha um plano em /planos pra continuar."
    : "A assinatura deste workspace não está ativa. Regularize em /planos.";
}

/**
 * Exige que o tenant tenha assinatura usável E a feature ligada.
 * Retorna null se ok, ou a NextResponse de erro pra rota devolver direto.
 */
export async function requireFeature(
  tenantId: string,
  feature: keyof PlanFeatures,
  featureLabel: string
): Promise<NextResponse | null> {
  const sub = await resolveSubscription(tenantId);
  if (!sub) {
    return paymentRequired("Este workspace não tem uma assinatura. Escolha um plano em /planos.");
  }
  if (!sub.isUsable) {
    return paymentRequired(inactiveSubscriptionMessage(sub));
  }
  if (!sub.plan.features[feature]) {
    return paymentRequired(`${featureLabel} não está incluso no plano ${sub.plan.name}. Faça upgrade em /planos.`);
  }
  return null;
}

/**
 * Exige assinatura usável e (se o plano tiver teto) que o total de alunos
 * após a operação caiba no limite.
 */
export async function requireStudentCapacity(
  tenantId: string,
  studentsBeingAdded: number
): Promise<NextResponse | null> {
  const sub = await resolveSubscription(tenantId);
  if (!sub) {
    return paymentRequired("Este workspace não tem uma assinatura. Escolha um plano em /planos.");
  }
  if (!sub.isUsable) {
    return paymentRequired(inactiveSubscriptionMessage(sub));
  }

  const max = sub.plan.maxStudents;
  if (max === null) return null;

  const current = await prisma.student.count({ where: { tenantId, active: true } });
  if (current + studentsBeingAdded > max) {
    return paymentRequired(
      `O plano ${sub.plan.name} permite até ${max} alunos (você tem ${current} e está adicionando ${studentsBeingAdded}). Faça upgrade em /planos.`
    );
  }
  return null;
}

/**
 * Exige assinatura usável e que o tenant caiba no teto de USUÁRIOS
 * (Memberships ativas) do plano. Conta convites PENDENTE junto com
 * Memberships ativas — senão dois convites simultâneos furam o limite antes
 * de qualquer um deles ser aceito (ver Invite no schema).
 */
export async function requireUserSeatCapacity(
  tenantId: string,
  seatsBeingAdded: number
): Promise<NextResponse | null> {
  const sub = await resolveSubscription(tenantId);
  if (!sub) {
    return paymentRequired("Este workspace não tem uma assinatura. Escolha um plano em /planos.");
  }
  if (!sub.isUsable) {
    return paymentRequired(inactiveSubscriptionMessage(sub));
  }

  const max = sub.plan.maxUsers;
  if (max === null) return null;

  const [activeMembers, pendingInvites] = await Promise.all([
    prisma.membership.count({ where: { tenantId, active: true } }),
    prisma.invite.count({ where: { tenantId, status: "PENDENTE" } }),
  ]);
  const current = activeMembers + pendingInvites;

  if (current + seatsBeingAdded > max) {
    return paymentRequired(
      `O plano ${sub.plan.name} permite até ${max} usuário(s) (você tem ${activeMembers} ativo(s) e ${pendingInvites} convite(s) pendente(s)). Faça upgrade em /planos pra convidar mais gente.`
    );
  }
  return null;
}

const OCR_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // ciclo fixo de 30 dias (independe do dia de fechamento do plano)

/**
 * Exige assinatura usável e capacidade dentro do teto mensal de OCR/IA.
 * Reseta o contador (lazy, na leitura) quando o ciclo de 30 dias vira —
 * mesmo padrão do `trialExpired` em `resolveSubscription`.
 */
export async function requireOcrCapacity(tenantId: string): Promise<NextResponse | null> {
  const blocked = await requireFeature(tenantId, "ocr", "Lançamento por foto (OCR)");
  if (blocked) return blocked;

  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub) return paymentRequired("Este workspace não tem uma assinatura. Escolha um plano em /planos.");

  const plan = await findPlanByTier(sub.tier);
  const max = plan?.maxOcrPerMonth ?? null;
  if (max === null) return null;

  const periodExpired = Date.now() - sub.ocrPeriodStart.getTime() > OCR_PERIOD_MS;
  const used = periodExpired ? 0 : sub.ocrUsedThisPeriod;

  if (used >= max) {
    return paymentRequired(
      `O plano ${plan?.name ?? sub.tier} permite até ${max} lançamentos por foto a cada 30 dias (você já usou ${used}). Faça upgrade em /planos.`
    );
  }
  return null;
}

/** Incrementa o contador de uso de OCR — chamar só após um processamento bem-sucedido. */
export async function recordOcrUsage(tenantId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!sub) return;

  const periodExpired = Date.now() - sub.ocrPeriodStart.getTime() > OCR_PERIOD_MS;
  await prisma.subscription.update({
    where: { tenantId },
    data: periodExpired
      ? { ocrUsedThisPeriod: 1, ocrPeriodStart: new Date() }
      : { ocrUsedThisPeriod: { increment: 1 } },
  });
}
