import { prisma } from "@/lib/prisma";
import { sendEmail, consecutiveAbsencesEmail } from "@/lib/email/resend";
import { findRecentAttendanceForAbsenceCheck } from "@/repositories/attendance.repository";

/**
 * Aviso de faltas consecutivas (Etapa 6) — roda 1x/dia via
 * `/api/cron/check-consecutive-absences`, mesmo padrão de
 * `/api/cron/check-expiring-subscriptions` (CRON_SECRET, sem estado por
 * tenant). "Configurável" = parâmetro `threshold` do próprio cron (default
 * abaixo) — não existe ainda uma tela de configuração por escola; ajustar
 * isso é uma evolução futura, fora do escopo desta rodada.
 *
 * Só dispara UMA VEZ por streak: alerta apenas quando a falta mais recente
 * fecha um streak de EXATAMENTE `threshold` faltas seguidas (o registro
 * imediatamente anterior ao streak é presença ou não existe) — sem isso,
 * um aluno com 10 faltas seguidas geraria um e-mail por dia adicional além
 * do primeiro alerta, o que é ruído, não sinal.
 */

export const DEFAULT_CONSECUTIVE_ABSENCE_THRESHOLD = 3;
const LOOKBACK_DAYS = 60;

interface AttendanceRow {
  enrollmentId: string;
  classSubjectId: string;
  date: Date;
  present: boolean;
  enrollment: { student: { name: string } };
  classSubject: {
    subject: { name: string };
    class: { name: string };
    teacher: { user: { email: string } } | null;
  };
}

export async function checkConsecutiveAbsences(
  threshold: number = DEFAULT_CONSECUTIVE_ABSENCE_THRESHOLD
): Promise<{ alertsSent: number }> {
  const sinceDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = (await findRecentAttendanceForAbsenceCheck(sinceDate)) as unknown as AttendanceRow[];

  // Já vem ordenado por (enrollmentId, classSubjectId, date desc) — agrupa em memória.
  const groups = new Map<string, AttendanceRow[]>();
  for (const row of rows) {
    const key = `${row.enrollmentId}::${row.classSubjectId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  let alertsSent = 0;
  for (const groupRows of groups.values()) {
    if (groupRows.length < threshold) continue;

    const window = groupRows.slice(0, threshold);
    const streakIsAllAbsent = window.every((r) => !r.present);
    if (!streakIsAllAbsent) continue;

    // O registro seguinte (mais antigo) precisa ser presença ou não existir —
    // senão o streak já passou de `threshold` e já foi alertado antes.
    const dayBeforeStreak = groupRows[threshold];
    if (dayBeforeStreak && !dayBeforeStreak.present) continue;

    const teacherEmail = window[0].classSubject.teacher?.user.email;
    if (!teacherEmail) continue;

    // Dedup: já alertamos exatamente este streak (mesma falta mais recente)?
    const alreadyAlerted = await prisma.absenceAlertLog.findUnique({
      where: {
        enrollmentId_classSubjectId_lastAbsenceDate: {
          enrollmentId: window[0].enrollmentId,
          classSubjectId: window[0].classSubjectId,
          lastAbsenceDate: window[0].date,
        },
      },
    });
    if (alreadyAlerted) continue;

    await sendEmail({
      to: teacherEmail,
      ...consecutiveAbsencesEmail({
        studentName: window[0].enrollment.student.name,
        subjectName: window[0].classSubject.subject.name,
        className: window[0].classSubject.class.name,
        consecutiveCount: threshold,
      }),
    });
    await prisma.absenceAlertLog.create({
      data: {
        enrollmentId: window[0].enrollmentId,
        classSubjectId: window[0].classSubjectId,
        lastAbsenceDate: window[0].date,
      },
    });
    alertsSent++;
  }

  return { alertsSent };
}
