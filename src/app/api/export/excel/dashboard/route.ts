import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { withTenant } from "@/lib/with-tenant";
import { forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getDashboardReport, deriveDashboardSummary } from "@/repositories/dashboard-report.repository";
import { RECOVERY_THRESHOLD } from "@/types/grade-grid";

/**
 * GET /api/export/excel/dashboard — versão Excel do relatório consolidado
 * do tenant, irmã de `/api/export/pdf/dashboard`: mesma fonte de dado
 * (`dashboard-report.repository.ts`), mesmo RBAC/escopo de tenant, sem
 * geração antecipada (gera na hora, a cada request).
 *
 * `exceljs`, não `xlsx`: a lib `xlsx` (SheetJS Community Edition) já usada
 * no parser de import não escreve negrito/cor de fundo/freeze panes na
 * versão livre (confirmado lendo o código-fonte do writer — `fontId`/
 * `fillId` saem sempre zerados, sem gate por opção; freeze panes não tem
 * NENHUMA rota de escrita no writer dessa build). `exceljs` é MIT/grátis e
 * suporta os três nativamente — troca de dependência aprovada
 * explicitamente pelo usuário depois de eu mostrar essa limitação, em vez
 * de simplesmente tentar forçar estilo que não seria salvo no arquivo.
 *
 * 3 abas:
 * - "Resumo": workspace, ano letivo, métricas gerais.
 * - "Desempenho por turma": turma × disciplina × período × média (mesmo
 *   detalhe do PDF, uma linha por combinação).
 * - "Pontos de atenção": aluno/turma/motivo + severidade (derivada dos
 *   mesmos limiares já usados na GradeGrid/boletim — `PASSING_AVERAGE`/
 *   `RECOVERY_THRESHOLD` em types/grade-grid.ts — não é uma escala nova),
 *   com destaque de cor de fundo por severidade (mesma lógica semântica de
 *   `--color-data-negative` no frontend, adaptada pra um tom claro de
 *   preenchimento de célula — a cor sólida do token é forte demais pra
 *   fundo de célula com texto preto em cima).
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4FC3E8" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FF1A2332" } };
const SEVERITY_FILL: Record<"Alta" | "Média", ExcelJS.Fill> = {
  Alta: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }, // vermelho claro
  Média: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } }, // âmbar claro
};

function severityOf(reason: string): "Alta" | "Média" {
  const gradeMatch = reason.match(/^média ([\d.,]+)/);
  if (gradeMatch) {
    const value = Number(gradeMatch[1].replace(",", "."));
    return value < RECOVERY_THRESHOLD ? "Alta" : "Média";
  }
  const attendanceMatch = reason.match(/^frequência (\d+)%/);
  if (attendanceMatch) {
    const pct = Number(attendanceMatch[1]);
    return pct < 50 ? "Alta" : "Média";
  }
  return "Média";
}

/** Aplica negrito + fundo na primeira linha (cabeçalho) e congela ela (freeze panes). */
function styleHeaderRow(ws: ExcelJS.Worksheet, headerRowNumber = 1) {
  const row = ws.getRow(headerRowNumber);
  row.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
  });
  ws.views = [{ state: "frozen", ySplit: headerRowNumber }];
}

/** Largura de coluna a partir do maior conteúdo (cabeçalho + linhas), com teto/piso razoáveis. */
function autoWidthColumns(ws: ExcelJS.Worksheet) {
  ws.columns.forEach((col) => {
    let maxLen = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, 40);
  });
}

/** Extraído do handler pra ser reaproveitado por `GET /api/export/download/[token]` (link assinado de WhatsApp) — mesma lógica, sem duplicar. */
export async function buildDashboardExcelBuffer(tenantId: string): Promise<{ buffer: ExcelJS.Buffer; tenantName: string }> {
  const report = await getDashboardReport(tenantId);
  const summary = deriveDashboardSummary(report);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AvaliaSmart";
  workbook.created = new Date();

  // --- Resumo ---------------------------------------------------------
  const resumoSheet = workbook.addWorksheet("Resumo");
  resumoSheet.addRow(["AvaliaSmart — Relatório do Dashboard"]);
  resumoSheet.addRow(["Workspace", report.tenantName]);
  resumoSheet.addRow(["Ano letivo", report.academicYear ?? "—"]);
  resumoSheet.addRow([]);
  const resumoHeaderRow = resumoSheet.addRow(["Métrica", "Valor"]);

  const mediaRow = resumoSheet.addRow([
    "Média geral",
    summary.metrics.overallAverage !== null ? Number(summary.metrics.overallAverage.toFixed(1)) : "—",
  ]);
  if (summary.metrics.overallAverage !== null) mediaRow.getCell(2).numFmt = "0.0";

  const aprovacaoRow = resumoSheet.addRow([
    "Aprovação (estimada)",
    // Fração (0-1), não 0-100: o formato "0.0%" do Excel multiplica por 100 na exibição.
    summary.metrics.approvalRatePct !== null ? summary.metrics.approvalRatePct / 100 : "—",
  ]);
  if (summary.metrics.approvalRatePct !== null) aprovacaoRow.getCell(2).numFmt = "0.0%";

  const frequenciaRow = resumoSheet.addRow([
    "Frequência média",
    summary.metrics.averageAttendancePct !== null ? summary.metrics.averageAttendancePct / 100 : "—",
  ]);
  if (summary.metrics.averageAttendancePct !== null) frequenciaRow.getCell(2).numFmt = "0.0%";

  styleHeaderRow(resumoSheet, resumoHeaderRow.number);
  autoWidthColumns(resumoSheet);

  // --- Desempenho por turma --------------------------------------------
  const desempenhoSheet = workbook.addWorksheet("Desempenho por turma");
  desempenhoSheet.addRow(["Turma", "Disciplina", "Período", "Média"]);
  for (const c of report.classes) {
    for (const s of c.subjects) {
      for (const t of s.termAverages) {
        const row = desempenhoSheet.addRow([
          c.className,
          s.subjectName,
          t.termName,
          t.average !== null ? Number(t.average.toFixed(1)) : "—",
        ]);
        if (t.average !== null) row.getCell(4).numFmt = "0.0";
      }
    }
  }
  styleHeaderRow(desempenhoSheet);
  autoWidthColumns(desempenhoSheet);

  // --- Pontos de atenção -------------------------------------------------
  const atencaoSheet = workbook.addWorksheet("Pontos de atenção");
  atencaoSheet.addRow(["Aluno", "Turma", "Motivo", "Severidade"]);
  for (const p of report.attentionPoints) {
    const severity = severityOf(p.reason);
    const row = atencaoSheet.addRow([p.studentName, p.className, p.reason, severity]);
    row.eachCell((cell) => {
      cell.fill = SEVERITY_FILL[severity];
    });
  }
  styleHeaderRow(atencaoSheet);
  autoWidthColumns(atencaoSheet);

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, tenantName: report.tenantName };
}

export const GET = withTenant(async (_request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para exportar o relatório do dashboard.");
  }

  const { buffer, tenantName } = await buildDashboardExcelBuffer(user.tenantId);
  const safeName = tenantName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dashboard-${safeName}.xlsx"`,
    },
  });
});
