import { prisma } from "@/lib/prisma";
import { resolveSubscription } from "@/lib/billing/guard";
import { getClassPerformanceData } from "@/repositories/performance.repository";
import { dispatchNotification } from "@/services/notification.service";
import { sendEmail, riskAlertEmail } from "@/lib/email/resend";
import { RECOVERY_THRESHOLD } from "@/types/grade-grid";
import type { RiskAlertType } from "@prisma/client";

/**
 * Alerta proativo de risco de reprovação — roda 1x/dia via
 * `/api/cron/check-risk-alerts` (mesmo padrão de check-consecutive-absences).
 *
 * DECISÃO DE DESIGN: baseado em REGRA (média/frequência), não em IA. A
 * predição de risco (services/ai/risk-prediction.service.ts) é sob demanda,
 * um clique do professor — chamar o LLM automaticamente todo dia, pra cada
 * turma de cada tenant, multiplicaria o custo de IA e o rate limit por N
 * (turmas) x M (tenants) x 1/dia sem controle nenhum de quem pediu. O
 * critério de regra usa os MESMOS limiares já usados na classificação de
 * nota (RECOVERY_THRESHOLD) + o mesmo limiar de frequência baixa já usado
 * em getClassPerformanceData (75%) — sem inventar um terceiro critério.
 *
 * Só roda pra tenant cujo plano tem `riskPrediction` habilitado — é uma
 * feature paga, a versão automática respeita o mesmo gate da versão
 * sob-demanda.
 */

export const ATTENDANCE_RISK_THRESHOLD = 75;

interface DetectedRisk {
  type: RiskAlertType;
  label: string;
}

function detectRisks(average: number | null, attendancePct: number): DetectedRisk[] {
  const risks: DetectedRisk[] = [];
  if (average !== null && average < RECOVERY_THRESHOLD) {
    risks.push({ type: "MEDIA_BAIXA", label: `Média geral ${average.toFixed(1)} (abaixo de ${RECOVERY_THRESHOLD})` });
  }
  if (attendancePct < ATTENDANCE_RISK_THRESHOLD) {
    risks.push({
      type: "FREQUENCIA_BAIXA",
      label: `Frequência ${attendancePct.toFixed(0)}% (abaixo de ${ATTENDANCE_RISK_THRESHOLD}%)`,
    });
  }
  return risks;
}

export async function checkRiskAlerts(): Promise<{ alertsSent: number }> {
  const activeSubs = await prisma.subscription.findMany({ where: { status: "ATIVA" } });
  let alertsSent = 0;

  for (const sub of activeSubs) {
    const resolved = await resolveSubscription(sub.tenantId);
    if (!resolved || !resolved.isUsable || !resolved.plan.features.riskPrediction) continue;

    const academicYear = await prisma.academicYear.findFirst({
      where: { tenantId: sub.tenantId, isActive: true },
    });
    if (!academicYear) continue;

    const term = await prisma.term.findFirst({
      where: { academicYearId: academicYear.id },
      orderBy: { order: "desc" },
    });
    if (!term) continue;

    const classes = await prisma.class.findMany({
      where: { tenantId: sub.tenantId, academicYearId: academicYear.id },
    });
    if (classes.length === 0) continue;

    const admin = await prisma.membership.findFirst({
      where: { tenantId: sub.tenantId, role: "ADMIN" },
      include: { user: true },
    });
    if (!admin?.user.email) continue;

    for (const klass of classes) {
      const data = await getClassPerformanceData(sub.tenantId, klass.id, term.id);
      if (!data) continue;

      for (const student of data.allStudents) {
        const risks = detectRisks(student.average, student.attendancePct);
        if (risks.length === 0) continue;

        const newRisks: DetectedRisk[] = [];
        for (const risk of risks) {
          try {
            // A unique constraint (enrollmentId, termId, riskType) É o
            // dedup — criar a linha primeiro e só notificar se criou é
            // atômico (evita duas execuções concorrentes do cron alertarem
            // duas vezes o mesmo risco).
            await prisma.riskAlertLog.create({
              data: { enrollmentId: student.enrollmentId, termId: term.id, riskType: risk.type },
            });
            newRisks.push(risk);
          } catch {
            // P2002 (já alertado neste período) — silenciosamente ignorado, esperado.
          }
        }
        if (newRisks.length === 0) continue;

        const outcome = await dispatchNotification({
          tenantId: sub.tenantId,
          trigger: "RISCO_REPROVACAO",
          to: admin.user.email,
          studentId: student.studentId,
          vars: {
            nome_aluno: student.name,
            turma: klass.name,
            media: student.average !== null ? student.average.toFixed(1) : "sem notas",
            frequencia: `${student.attendancePct.toFixed(0)}%`,
          },
        });

        if (!outcome.sent && outcome.reason === "no-template") {
          await sendEmail({
            to: admin.user.email,
            ...riskAlertEmail({
              studentName: student.name,
              className: klass.name,
              reasons: newRisks.map((r) => r.label),
            }),
          });
        }
        alertsSent++;
      }
    }
  }

  return { alertsSent };
}
