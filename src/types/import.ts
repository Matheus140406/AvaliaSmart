import type { GradeConfigDTO } from "./grade-grid";

/** Resultado cru do parse client-side, antes de qualquer mapeamento. */
export interface ParsedSpreadsheet {
  fileName: string;
  headers: string[];
  /** Cada linha é um objeto { header: valor }, na ordem original do arquivo. */
  rows: Record<string, string | number | null>[];
}

/**
 * Alvo de uma coluna do arquivo. `grade:<gradeConfigId>` é dinâmico — depende
 * das avaliações (GradeConfig) configuradas pra turma/disciplina/período que
 * está recebendo o import.
 */
export type ImportTarget =
  | "IGNORAR"
  | "NOME_ALUNO"
  | "MATRICULA"
  | `NOTA:${string}`;

export interface ColumnMapping {
  sourceHeader: string;
  target: ImportTarget;
}

export interface ValidationIssue {
  rowIndex: number; // índice na planilha original (0-based, sem contar cabeçalho)
  sourceHeader: string;
  severity: "error" | "warning";
  message: string;
}

/** Uma linha já mapeada e pronta pra revisão/validação. */
export interface MappedRow {
  rowIndex: number;
  studentName: string | null;
  registrationCode: string | null;
  grades: Record<string, number | null>; // gradeConfigId -> valor
}

export interface ImportContext {
  classId: string;
  classSubjectId: string;
  termId: string;
  gradeConfigs: GradeConfigDTO[];
}
