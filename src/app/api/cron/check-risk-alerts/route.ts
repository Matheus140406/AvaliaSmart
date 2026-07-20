import { NextRequest, NextResponse } from "next/server";
import { checkRiskAlerts } from "@/services/risk-alert.service";

/**
 * GET /api/cron/check-risk-alerts — chamado 1x/dia pelo Vercel Cron (ver
 * vercel.json). Mesma proteção por CRON_SECRET dos outros crons
 * (check-expiring-subscriptions, check-consecutive-absences).
 */

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const { alertsSent } = await checkRiskAlerts();
  return NextResponse.json({ success: true, data: { alertsSent } });
}
