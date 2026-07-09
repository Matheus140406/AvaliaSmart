import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function findImportHistoryByIdempotencyKey(idempotencyKey: string) {
  return prisma.importHistory.findUnique({ where: { idempotencyKey } });
}

export function findTermById(termId: string) {
  return prisma.term.findUnique({ where: { id: termId } });
}

export function findValidGradeConfigIds(configIds: string[], classSubjectId: string, termId: string) {
  return prisma.gradeConfig.findMany({
    where: { id: { in: configIds }, classSubjectId, termId },
    select: { id: true },
  });
}

export function findStudentsByRegistrationOrName(registrationCodes: string[], names: string[]) {
  const or: Prisma.StudentWhereInput[] = [];
  if (registrationCodes.length > 0) or.push({ registrationCode: { in: registrationCodes } });
  if (names.length > 0) or.push({ name: { in: names } });
  if (or.length === 0) return Promise.resolve([]);
  // tenantId é injetado automaticamente aqui pela Client Extension (Student
  // está em TENANT_SCOPED_MODELS) — não precisa repetir na mão.
  return prisma.student.findMany({ where: { OR: or } });
}

export function findEnrollmentsForStudents(classId: string, academicYearId: string, studentIds: string[]) {
  if (studentIds.length === 0) return Promise.resolve([]);
  return prisma.enrollment.findMany({ where: { classId, academicYearId, studentId: { in: studentIds } } });
}

export function findExistingGradeKeys(enrollmentIds: string[], configIds: string[]) {
  if (enrollmentIds.length === 0) return Promise.resolve([]);
  return prisma.grade.findMany({
    where: { enrollmentId: { in: enrollmentIds }, gradeConfigId: { in: configIds } },
    select: { enrollmentId: true, gradeConfigId: true },
  });
}

export interface NewStudentInput {
  id: string;
  tenantId: string;
  name: string;
  registrationCode: string | null;
}

export interface NewEnrollmentInput {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
}

export interface GradeEntryInput {
  enrollmentId: string;
  gradeConfigId: string;
  value: number;
}

export interface CommitImportInput {
  tenantId: string;
  membershipId: string;
  classId: string;
  classSubjectId: string;
  termId: string;
  fileName?: string;
  idempotencyKey: string;
  rowsCount: number;
  newStudents: NewStudentInput[];
  newEnrollments: NewEnrollmentInput[];
  gradesToCreate: GradeEntryInput[];
  gradesToUpdate: GradeEntryInput[];
}

export interface ImportCommitResult {
  rowsProcessed: number;
  studentsImported: number;
  gradesCreated: number;
  gradesUpdated: number;
}

/**
 * Escreve tudo dentro de UMA transação. Se o insert final do ImportHistory
 * bater no unique constraint de `idempotencyKey` (corrida de duas
 * requisições idênticas), TUDO acima dá rollback — nenhuma escrita órfã
 * sobrevive (ver P2002 tratado em import.service.ts).
 */
export function commitImportTransaction(input: CommitImportInput): Promise<ImportCommitResult> {
  return prisma.$transaction(
    async (tx) => {
      if (input.newStudents.length > 0) {
        await tx.student.createMany({ data: input.newStudents });
      }
      if (input.newEnrollments.length > 0) {
        await tx.enrollment.createMany({ data: input.newEnrollments });
      }
      if (input.gradesToCreate.length > 0) {
        await tx.grade.createMany({
          data: input.gradesToCreate.map((g) => ({
            enrollmentId: g.enrollmentId,
            gradeConfigId: g.gradeConfigId,
            termId: input.termId,
            value: g.value,
            updatedById: input.membershipId,
          })),
        });
      }
      if (input.gradesToUpdate.length > 0) {
        // Poucas linhas na prática (só quando uma planilha reimportada muda
        // um valor já existente) — sequencial aqui é aceitável porque já
        // estamos numa única conexão/transação.
        for (const g of input.gradesToUpdate) {
          await tx.grade.update({
            where: { enrollmentId_gradeConfigId: { enrollmentId: g.enrollmentId, gradeConfigId: g.gradeConfigId } },
            data: { value: g.value, updatedById: input.membershipId },
          });
        }
      }

      await tx.importHistory.create({
        data: {
          tenantId: input.tenantId,
          membershipId: input.membershipId,
          classId: input.classId,
          classSubjectId: input.classSubjectId,
          termId: input.termId,
          fileName: input.fileName,
          idempotencyKey: input.idempotencyKey,
          rowsProcessed: input.rowsCount,
          studentsCreated: input.newStudents.length,
          gradesCreated: input.gradesToCreate.length,
          gradesUpdated: input.gradesToUpdate.length,
          status: "SUCESSO",
        },
      });

      return {
        rowsProcessed: input.rowsCount,
        studentsImported: input.newStudents.length,
        gradesCreated: input.gradesToCreate.length,
        gradesUpdated: input.gradesToUpdate.length,
      };
    },
    { timeout: 30_000 }
  );
}
