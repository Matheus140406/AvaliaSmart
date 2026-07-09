import * as XLSX from "xlsx";
import type { ImportContext } from "@/types/import";

/**
 * Gera o .xlsx "modelo" pra essa turma/disciplina/período específica — os
 * nomes de coluna são EXATAMENTE os que `guessTarget` (ImportWizard.tsx)
 * já sabe reconhecer sozinho ("Nome do Aluno", "Matrícula", e o nome de
 * cada GradeConfig ativo): quem preencher esse modelo e reenviar cai direto
 * no mapeamento certo, sem precisar corrigir nada no passo 2 do wizard.
 *
 * Client-side, mesma lib (SheetJS) já usada pra LER planilha em
 * `parse-spreadsheet.ts` — nenhum round-trip pro servidor só pra gerar um
 * arquivo estático.
 */
export function generateImportTemplate(context: ImportContext): void {
  const headers = ["Nome do Aluno", "Matrícula", ...context.gradeConfigs.map((gc) => gc.name)];

  const exampleRow = [
    "Ana Beatriz Souza",
    "2026001",
    ...context.gradeConfigs.map((gc) => (gc.maxScore * 0.8).toFixed(1)),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  worksheet["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 14) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Modelo");

  XLSX.writeFile(workbook, "modelo-importacao-notas.xlsx");
}
