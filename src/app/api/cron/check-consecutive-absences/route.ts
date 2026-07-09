import { NextRequest, NextResponse } from "next/server";
import { checkConsecutiveAbsences, DEFAULT_CONSECUTIVE_ABSENCE_THRESHOLD } from "@/services/attendance-alert.service";

/**
 * GET /api/cron/check-consecutive-absences — chamado 1x/dia pelo Vercel
 * Cron (ver vercel.json). Mesma proteção por CRON_SECRET de
 * check-expiring-subscriptions. `?threshold=N` permite ajustar o número de
 * faltas seguidas que dispara o aviso (default abaixo).
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

  const thresholdParam = request.nextUrl.searchParams.get("threshold");
  const threshold = thresholdParam ? Number(thresholdParam) : DEFAULT_CONSECUTIVE_ABSENCE_THRESHOLD;
  if (!Number.isInteger(threshold) || threshold < 1) {
    return NextResponse.json({ success: false, error: "threshold inválido." }, { status: 400 });
  }

  const { alertsSent } = await checkConsecutiveAbsences(threshold);
  return NextResponse.json({ success: true, data: { threshold, alertsSent } });
}
