// Tipos compartilhados pela Grid de Lançamento de Notas.
// Espelham o shape retornado pela API a partir do schema Prisma
// (Student, Enrollment, GradeConfig, Grade, Attendance).

export interface GradeConfigDTO {
  id: string;
  name: string;
  typeId: string;
  typeName: string;
  weight: number;
  maxScore: number;
  order: number;
}

export interface StudentRow {
  enrollmentId: string;
  studentId: string;
  name: string;
  photoUrl?: string | null;
  registrationCode?: string | null;
  attendancePct: number; // 0-100, vindo do backend (Attendance agregada)
}

/** value = null significa célula vazia (pendente) */
export interface GradeCellValue {
  gradeId: string | null;
  enrollmentId: string;
  gradeConfigId: string;
  value: number | null;
}

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface CellKey {
  enrollmentId: string;
  gradeConfigId: string;
}

export function cellKeyToString(key: CellKey): string {
  return `${key.enrollmentId}:${key.gradeConfigId}`;
}

export const PASSING_AVERAGE = 6; // média mínima de aprovação
export const RECOVERY_THRESHOLD = 4; // abaixo disso = reprovação direta, entre isso e PASSING = recuperação
