import type { MembershipRole } from "@prisma/client";
import { notFound, forbidden, badRequest } from "@/lib/http/errors";
import { findClassSubjectWithClass } from "@/repositories/class-subject.repository";
import {
  findActiveEnrollmentsWithAttendance,
  findEnrollmentById,
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
