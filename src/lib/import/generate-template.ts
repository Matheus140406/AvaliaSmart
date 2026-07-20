import ExcelJS from "exceljs";
import type { ImportContext } from "@/types/import";

/**
 * Gera o .xlsx "modelo" pra essa turma/disciplina/período específica — os
 * nomes de coluna são EXATAMENTE os que `guessTarget` (ImportWizard.tsx)
 * já sabe reconhecer sozinho ("Nome do Aluno", "Matrícula", e o nome de
 * cada GradeConfig ativo): quem preencher esse modelo e reenviar cai direto
 * no mapeamento certo, sem precisar corrigir nada no passo 2 do wizard.
 *
 * Client-side, com `exceljs` (mesma lib do parse em parse-spreadsheet.ts
 * desde a saída do SheetJS vulnerável) — nenhum round-trip pro servidor só
 * pra gerar um arquivo estático.
 */
export async function generateImportTemplate(context: ImportContext): Promise<void> {
  const headers = ["Nome do Aluno", "Matrícula", ...context.gradeConfigs.map((gc) => gc.name)];

  const exampleRow = [
    "Ana Beatriz Souza",
    "2026001",
    ...context.gradeConfigs.map((gc) => (gc.maxScore * 0.8).toFixed(1)),
  ];

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Modelo");
  worksheet.addRow(headers);
  worksheet.addRow(exampleRow);
  worksheet.columns = headers.map((h) => ({ width: Math.max(h.length + 4, 14) }));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "modelo-importacao-notas.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
}
