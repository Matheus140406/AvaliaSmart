import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findPlanByTier } from "@/repositories/plan.repository";
import { sendEmail, subscriptionExpiringSoonEmail } from "@/lib/email/resend";

/**
 * GET /api/cron/check-expiring-subscriptions — chamado 1x/dia pelo Vercel
 * Cron (ver vercel.json). Protegido por CRON_SECRET: a Vercel injeta
 * `Authorization: Bearer ${CRON_SECRET}` automaticamente nas chamadas de
 * cron — qualquer outra origem sem esse header é recusada.
 *
 * Três responsabilidades, nessa ordem:
 * 1. Expira de verdade: assinatura paga com `currentPeriodEnd` no passado e
 *    ainda ATIVA vira EXPIRADA (os guards de billing passam a bloquear).
 * 2. Avisa 3 dias antes do vencimento.
 * 3. Avisa NO dia do vencimento (última chance antes do bloqueio).
 *
 * Cada aviso usa uma janela de 24h ao redor do alvo (hoje+3 / hoje) — evita
 * depender do cron rodar num horário exato pra não perder o dia certo por
 * causa de fuso/atraso de execução.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

function windowAround(daysFromNow: number): { start: Date; end: Date } {
  const target = new Date(Date.now() + daysFromNow * 86_400_000);
  return {
    start: new Date(target.getTime() - 12 * 60 * 60 * 1000),
    end: new Date(target.getTime() + 12 * 60 * 60 * 1000),
  };
}

async function notifyExpiring(daysRemaining: 3 | 0): Promise<number> {
  const { start, end } = windowAround(daysRemaining);

  const subs = await prisma.subscription.findMany({
    where: {
      status: "ATIVA",
      tier: { not: "TESTE_GRATIS" },
      currentPeriodEnd: { gte: start, lte: end },
    },
    include: {
      tenant: {
        include: { memberships: { where: { role: "ADMIN" }, include: { user: true }, take: 1 } },
      },
    },
  });

  let sent = 0;
  for (const sub of subs) {
    const admin = sub.tenant.memberships[0]?.user;
    if (!admin?.email || !sub.currentPeriodEnd) continue;

    const plan = await findPlanByTier(sub.tier);
    await sendEmail({
      to: admin.email,
      ...subscriptionExpiringSoonEmail({
        planName: plan?.name ?? sub.tier,
        expiresAt: sub.currentPeriodEnd,
        daysRemaining,
      }),
    });
    sent++;
  }
  return sent;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Não autorizado." }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[cron] CRON_SECRET não configurado em produção — execução recusada.");
    return NextResponse.json({ success: false, error: "Cron não configurado." }, { status: 401 });
  }

  // 1. Expira assinaturas pagas vencidas (TESTE_GRATIS expira via guard.ts,
  // na leitura — não precisa do cron pra isso).
  const { count: expiredCount } = await prisma.subscription.updateMany({
    where: { status: "ATIVA", tier: { not: "TESTE_GRATIS" }, currentPeriodEnd: { lt: new Date() } },
    data: { status: "EXPIRADA" },
  });

  // 2 e 3. Avisos de vencimento (rodam depois da expiração de propósito —
  // uma assinatura que expirou HOJE não deveria mais cair no "vence hoje").
  const emailsSentIn3Days = await notifyExpiring(3);
  const emailsSentToday = await notifyExpiring(0);

  return NextResponse.json({
    success: true,
    data: { expiredCount, emailsSentIn3Days, emailsSentToday },
  });
}
