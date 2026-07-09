import { prisma } from "@/lib/prisma";

/** Matrículas ativas de uma turma + a Attendance (se existir) já lançada para a data/disciplina pedidas. */
export function findActiveEnrollmentsWithAttendance(classId: string, classSubjectId: string, date: Date) {
  return prisma.enrollment.findMany({
    where: { classId, status: "ATIVA" },
    include: {
      student: true,
      attendances: { where: { classSubjectId, date } },
    },
    orderBy: { student: { name: "asc" } },
  });
}

export function findEnrollmentById(enrollmentId: string) {
  return prisma.enrollment.findUnique({ where: { id: enrollmentId } });
}

export interface UpsertAttendanceParams {
  enrollmentId: string;
  classSubjectId: string;
  date: Date;
  present: boolean;
  justified: boolean;
}

export function upsertAttendance(params: UpsertAttendanceParams) {
  return prisma.attendance.upsert({
    where: {
      enrollmentId_classSubjectId_date: {
        enrollmentId: params.enrollmentId,
        classSubjectId: params.classSubjectId,
        date: params.date,
      },
    },
    create: params,
    update: { present: params.present, justified: params.justified },
  });
}

/**
 * Janela recente de chamada (todas as matrículas ativas, todos os
 * tenants) — usada pelo job de faltas consecutivas. `sinceDate` limita o
 * volume da query: nenhum streak plausível de "faltas seguidas" precisa
 * olhar mais que uns 60 dias pra trás.
 */
export function findRecentAttendanceForAbsenceCheck(sinceDate: Date) {
  return prisma.attendance.findMany({
    where: { date: { gte: sinceDate }, enrollment: { status: "ATIVA" } },
    include: {
      enrollment: { include: { student: true } },
      classSubject: {
        include: {
          subject: true,
          class: true,
          teacher: { include: { user: true } },
        },
      },
    },
    orderBy: [{ enrollmentId: "asc" }, { classSubjectId: "asc" }, { date: "desc" }],
  });
}
