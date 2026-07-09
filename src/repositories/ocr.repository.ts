import { prisma } from "@/lib/prisma";

export function findGradeConfigNames(classSubjectId: string, termId: string) {
  return prisma.gradeConfig.findMany({ where: { classSubjectId, termId }, select: { name: true } });
}

export function findActiveEnrollmentsWithStudentNames(classId: string) {
  return prisma.enrollment.findMany({
    where: { classId, status: "ATIVA" },
    include: { student: { select: { name: true } } },
  });
}
