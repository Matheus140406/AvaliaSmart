import type { MembershipRole } from "@prisma/client";
import { notFound, forbidden, badRequest } from "@/lib/http/errors";
import { findClassSubjectWithClass } from "@/repositories/class-subject.repository";
import {
  findActiveEnrollmentsWithAttendance,
  findEnrollmentById,
  findMonthlyAttendance,
  upsertAttendance,
} from "@/repositories/attendance.repository";

/**
 * Lista de chamada — mesmo padrão de RBAC/tenant-check de
 * `grade.service.ts` (mesma tela conceitualmente: turma + disciplina +
 * uma auto-save por linha), só que a unidade de lançamento é uma DATA
 * (não um período/bimestre inteiro) e o valor é presente/ausente, não uma
 * nota numérica.
 */

function parseDateOnly(dateStr: string): Date {
  // "YYYY-MM-DD" -> meia-noite UTC daquele dia, sem depender do fuso do
  // servidor — evita a data mudar de dia dependendo de onde o processo roda.
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw badRequest("Data inválida.");
  }
  return date;
}

export interface GetAttendanceSheetParams {
  tenantId: string;
  role: MembershipRole;
  membershipId: string;
  classSubjectId: string;
  date: string;
}

export async function getAttendanceSheet(params: GetAttendanceSheetParams) {
  const classSubject = await findClassSubjectWithClass(params.classSubjectId);
  if (!classSubject || classSubject.class.tenantId !== params.tenantId) {
    throw notFound("Turma/disciplina não encontrada.");
  }
  if (params.role === "PROFESSOR" && classSubject.teacherId !== params.membershipId) {
    throw forbidden("Você não leciona essa disciplina/turma.");
  }

  const date = parseDateOnly(params.date);
  const enrollments = await findActiveEnrollmentsWithAttendance(classSubject.classId, params.classSubjectId, date);

  return {
    students: enrollments.map((e) => ({
      enrollmentId: e.id,
      studentId: e.studentId,
      name: e.student.name,
      present: e.attendances[0]?.present ?? true,
      justified: e.attendances[0]?.justified ?? false,
      recorded: e.attendances.length > 0,
    })),
  };
}

export interface GetMonthlyAttendanceReportParams {
  tenantId: string;
  role: MembershipRole;
  membershipId: string;
  classSubjectId: string;
  month: string; // "YYYY-MM"
}

export interface MonthlyAttendanceReport {
  className: string;
  subjectName: string;
  monthLabel: string;
  days: number[]; // dias do mês com pelo menos uma chamada lançada, em ordem
  students: {
    studentName: string;
    registrationCode: string | null;
    marksByDay: Record<number, "P" | "F" | "J">;
    totalPresences: number;
    totalAbsences: number;
    attendancePct: number;
  }[];
}

const MONTH_REGEX = /^\d{4}-\d{2}$/;

/**
 * Export "papel" da lista de chamada — mesmo princípio do Mapa de Notas
 * (`mapa-notas`): um documento por mês, uma linha por aluno, uma coluna por
 * DIA que teve chamada lançada (não todo dia do calendário — evita colunas
 * vazias em dias sem aula). P = presente, F = falta, J = falta justificada.
 */
export async function getMonthlyAttendanceReport(params: GetMonthlyAttendanceReportParams): Promise<MonthlyAttendanceReport> {
  const classSubject = await findClassSubjectWithClass(params.classSubjectId);
  if (!classSubject || classSubject.class.tenantId !== params.tenantId) {
    throw notFound("Turma/disciplina não encontrada.");
  }
  if (params.role === "PROFESSOR" && classSubject.teacherId !== params.membershipId) {
    throw forbidden("Você não leciona essa disciplina/turma.");
  }
  if (!MONTH_REGEX.test(params.month)) {
    throw badRequest("Mês inválido — use o formato YYYY-MM.");
  }

  const [year, monthNum] = params.month.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59));

  const enrollments = await findMonthlyAttendance(classSubject.classId, params.classSubjectId, startDate, endDate);

  const daySet = new Set<number>();
  for (const e of enrollments) {
    for (const a of e.attendances) daySet.add(a.date.getUTCDate());
  }
  const days = [...daySet].sort((a, b) => a - b);

  const students = enrollments.map((e) => {
    const marksByDay: Record<number, "P" | "F" | "J"> = {};
    let totalPresences = 0;
    let totalAbsences = 0;
    for (const a of e.attendances) {
      const mark = a.present ? "P" : a.justified ? "J" : "F";
      marksByDay[a.date.getUTCDate()] = mark;
      if (a.present) totalPresences++;
      else totalAbsences++;
    }
    const totalRecorded = totalPresences + totalAbsences;
    const attendancePct = totalRecorded > 0 ? (totalPresences / totalRecorded) * 100 : 100;
    return {
      studentName: e.student.name,
      registrationCode: e.student.registrationCode,
      marksByDay,
      totalPresences,
      totalAbsences,
      attendancePct,
    };
  });

  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(startDate);

  return {
    className: classSubject.class.name,
    subjectName: classSubject.subject.name,
    monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
    days,
    students,
  };
}

export interface SaveAttendanceParams {
  tenantId: string;
  role: MembershipRole;
  membershipId: string;
  enrollmentId: string;
  classSubjectId: string;
  date: string;
  present: boolean;
  justified: boolean;
}

export async function saveAttendance(params: SaveAttendanceParams) {
  const classSubject = await findClassSubjectWithClass(params.classSubjectId);
  if (!classSubject || classSubject.class.tenantId !== params.tenantId) {
    throw notFound("Turma/disciplina não encontrada.");
  }
  if (params.role === "PROFESSOR" && classSubject.teacherId !== params.membershipId) {
    throw forbidden("Você não leciona essa disciplina/turma.");
  }

  const enrollment = await findEnrollmentById(params.enrollmentId);
  if (!enrollment || enrollment.classId !== classSubject.classId) {
    throw badRequest("Matrícula inválida para esta turma.");
  }

  const date = parseDateOnly(params.date);
  const attendance = await upsertAttendance({
    enrollmentId: params.enrollmentId,
    classSubjectId: params.classSubjectId,
    date,
    present: params.present,
    justified: params.justified,
  });

  return {
    id: attendance.id,
    enrollmentId: attendance.enrollmentId,
    present: attendance.present,
    justified: attendance.justified,
  };
}
