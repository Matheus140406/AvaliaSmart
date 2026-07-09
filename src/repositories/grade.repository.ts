import { prisma } from "@/lib/prisma";

export function findGradeConfigsForTerm(classSubjectId: string, termId: string) {
  return prisma.gradeConfig.findMany({
    where: { classSubjectId, termId },
    include: { type: true },
    orderBy: { order: "asc" },
  });
}

export function findActiveEnrollmentsWithGrid(classId: string, termId: string, classSubjectId: string) {
  return prisma.enrollment.findMany({
    where: { classId, status: "ATIVA" },
    include: {
      student: true,
      grades: { where: { termId } },
      attendances: { where: { classSubjectId } },
    },
    orderBy: { student: { name: "asc" } },
  });
}

export function findGradeConfigWithClassSubject(gradeConfigId: string) {
  return prisma.gradeConfig.findUnique({
    where: { id: gradeConfigId },
    include: { classSubject: { include: { class: true } } },
  });
}

export function findEnrollmentById(enrollmentId: string) {
  return prisma.enrollment.findUnique({ where: { id: enrollmentId } });
}

export function upsertGrade(params: {
  enrollmentId: string;
  gradeConfigId: string;
  termId: string;
  value: number | null;
  updatedById: string;
}) {
  return prisma.grade.upsert({
    where: {
      enrollmentId_gradeConfigId: { enrollmentId: params.enrollmentId, gradeConfigId: params.gradeConfigId },
    },
    create: params,
    update: { value: params.value, updatedById: params.updatedById },
  });
}
