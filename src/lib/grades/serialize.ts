import type { Attendance, Enrollment, EvaluationTypeOption, Grade, GradeConfig, Student } from "@prisma/client";
import type { GradeCellValue, GradeConfigDTO, StudentRow } from "@/types/grade-grid";

/**
 * Mapeamento único Prisma -> DTO usado tanto por `app/api/grades/route.ts` (GET)
 * quanto pelas páginas server-side que renderizam a `GradeGrid` — evita duas
 * implementações divergentes da mesma regra (ex.: cálculo de frequência).
 */

export type EnrollmentWithGridRelations = Enrollment & {
  student: Student;
  grades: Grade[];
  attendances: Attendance[];
};

export function toGradeConfigDTO(gc: GradeConfig & { type: EvaluationTypeOption }): GradeConfigDTO {
  return {
    id: gc.id,
    name: gc.name,
    typeId: gc.typeId,
    typeName: gc.type.name,
    weight: Number(gc.weight),
    maxScore: Number(gc.maxScore),
    order: gc.order,
  };
}

export function toStudentRow(enrollment: EnrollmentWithGridRelations): StudentRow {
  const total = enrollment.attendances.length;
  const present = enrollment.attendances.filter((a) => a.present || a.justified).length;

  return {
    enrollmentId: enrollment.id,
    studentId: enrollment.studentId,
    name: enrollment.student.name,
    photoUrl: enrollment.student.photoUrl,
    registrationCode: enrollment.student.registrationCode,
    // Sem registros de frequência ainda: não penaliza o aluno na coluna Freq.
    attendancePct: total > 0 ? (present / total) * 100 : 100,
  };
}

export function toGradeCellValues(enrollment: EnrollmentWithGridRelations): GradeCellValue[] {
  return enrollment.grades.map((g) => ({
    gradeId: g.id,
    enrollmentId: enrollment.id,
    gradeConfigId: g.gradeConfigId,
    value: g.value !== null ? Number(g.value) : null,
  }));
}
