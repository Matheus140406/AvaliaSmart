import type { MembershipRole } from "@prisma/client";
import { notFound, forbidden, badRequest } from "@/lib/http/errors";
import { toGradeCellValues, toGradeConfigDTO, toStudentRow } from "@/lib/grades/serialize";
import { findClassSubjectWithClass } from "@/repositories/class-subject.repository";
import {
  findGradeConfigsForTerm,
  findActiveEnrollmentsWithGrid,
  findGradeConfigWithClassSubject,
  findEnrollmentById,
  upsertGrade,
} from "@/repositories/grade.repository";

export interface GetGradeGridParams {
  tenantId: string;
  role: MembershipRole;
  membershipId: string;
  classSubjectId: string;
  termId: string;
}

export async function getGradeGrid(params: GetGradeGridParams) {
  const classSubject = await findClassSubjectWithClass(params.classSubjectId);
  if (!classSubject || classSubject.class.tenantId !== params.tenantId) {
    throw notFound("Turma/disciplina não encontrada.");
  }
  if (params.role === "PROFESSOR" && classSubject.teacherId !== params.membershipId) {
    throw forbidden("Você não leciona essa disciplina/turma.");
  }

  const [gradeConfigs, enrollments] = await Promise.all([
    findGradeConfigsForTerm(params.classSubjectId, params.termId),
    findActiveEnrollmentsWithGrid(classSubject.classId, params.termId, params.classSubjectId),
  ]);

  return {
    gradeConfigs: gradeConfigs.map(toGradeConfigDTO),
    students: enrollments.map(toStudentRow),
    initialGrades: enrollments.flatMap(toGradeCellValues),
  };
}

export interface SaveGradeParams {
  tenantId: string;
  role: MembershipRole;
  membershipId: string;
  enrollmentId: string;
  gradeConfigId: string;
  value: number | null;
}

export async function saveGrade(params: SaveGradeParams) {
  const gradeConfig = await findGradeConfigWithClassSubject(params.gradeConfigId);
  if (!gradeConfig) {
    throw notFound("Avaliação não encontrada.");
  }
  if (gradeConfig.classSubject.class.tenantId !== params.tenantId) {
    throw forbidden("Avaliação não pertence ao seu tenant.");
  }
  if (params.role === "PROFESSOR" && gradeConfig.classSubject.teacherId !== params.membershipId) {
    throw forbidden("Você não leciona essa disciplina/turma.");
  }

  const maxScore = Number(gradeConfig.maxScore);
  if (params.value !== null && params.value > maxScore) {
    throw badRequest(`A nota máxima para "${gradeConfig.name}" é ${maxScore}.`);
  }

  const enrollment = await findEnrollmentById(params.enrollmentId);
  if (!enrollment || enrollment.classId !== gradeConfig.classSubject.classId) {
    throw badRequest("Matrícula inválida para esta avaliação.");
  }

  const grade = await upsertGrade({
    enrollmentId: params.enrollmentId,
    gradeConfigId: params.gradeConfigId,
    termId: gradeConfig.termId,
    value: params.value,
    updatedById: params.membershipId,
  });

  return {
    id: grade.id,
    enrollmentId: grade.enrollmentId,
    gradeConfigId: grade.gradeConfigId,
    value: grade.value !== null ? Number(grade.value) : null,
    updatedAt: grade.updatedAt,
  };
}
