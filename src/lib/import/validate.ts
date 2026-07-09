import type {
  ColumnMapping,
  ImportContext,
  ImportTarget,
  MappedRow,
  ParsedSpreadsheet,
  ValidationIssue,
} from "@/types/import";

/**
 * Converte as linhas cruas do parser + o mapeamento de colunas escolhido pelo
 * usuário em `MappedRow[]` prontas pra revisão, junto com o relatório de
 * validação (células vazias, formatos de nota inválidos) pedido no briefing.
 */
export function applyMapping(
  parsed: ParsedSpreadsheet,
  mappings: ColumnMapping[],
  context: ImportContext
): { rows: MappedRow[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  const nameMapping = mappings.find((m) => m.target === "NOME_ALUNO");
  if (!nameMapping) {
    issues.push({
      rowIndex: -1,
      sourceHeader: "",
      severity: "error",
      message: 'Nenhuma coluna foi mapeada para "Nome do Aluno" — isso é obrigatório.',
    });
    return { rows: [], issues };
  }

  const registrationMapping = mappings.find((m) => m.target === "MATRICULA");
  const gradeMappings = mappings.filter((m) => m.target.startsWith("NOTA:"));
  const gradeConfigById = new Map(context.gradeConfigs.map((gc) => [gc.id, gc]));

  const rows: MappedRow[] = parsed.rows.map((row, rowIndex) => {
    const rawName = row[nameMapping.sourceHeader];
    const studentName = rawName === null || rawName === undefined ? null : String(rawName).trim() || null;
    if (!studentName) {
      issues.push({
        rowIndex,
        sourceHeader: nameMapping.sourceHeader,
        severity: "error",
        message: "Nome do aluno está vazio nesta linha.",
      });
    }

    const rawRegistration = registrationMapping ? row[registrationMapping.sourceHeader] : null;
    const registrationCode =
      rawRegistration === null || rawRegistration === undefined
        ? null
        : String(rawRegistration).trim() || null;

    const grades: Record<string, number | null> = {};
    for (const mapping of gradeMappings) {
      const gradeConfigId = mapping.target.slice("NOTA:".length);
      const gradeConfig = gradeConfigById.get(gradeConfigId);
      if (!gradeConfig) continue; // mapeamento órfão (avaliação removida depois do mapeamento)

      const raw = row[mapping.sourceHeader];
      const { value, issue } = parseGradeValue(raw, gradeConfig.maxScore);
      grades[gradeConfigId] = value;

      if (issue) {
        issues.push({ rowIndex, sourceHeader: mapping.sourceHeader, severity: "error", message: issue });
      } else if (raw === null || raw === undefined || String(raw).trim() === "") {
        issues.push({
          rowIndex,
          sourceHeader: mapping.sourceHeader,
          severity: "warning",
          message: `Nota de "${gradeConfig.name}" está em branco.`,
        });
      }
    }

    return { rowIndex, studentName, registrationCode, grades };
  });

  return { rows, issues };
}

function parseGradeValue(
  raw: string | number | null,
  maxScore: number
): { value: number | null; issue?: string } {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { value: null }; // célula vazia: ausência de nota, não é erro de formato
  }

  const normalized = String(raw).replace(",", ".").trim();
  const parsedValue = Number(normalized);

  if (Number.isNaN(parsedValue)) {
    return { value: null, issue: `Valor "${raw}" não é um número válido.` };
  }
  if (parsedValue < 0) {
    return { value: null, issue: `Nota negativa (${parsedValue}).` };
  }
  if (parsedValue > maxScore) {
    return { value: null, issue: `Nota ${parsedValue} excede o máximo permitido (${maxScore}).` };
  }
  return { value: parsedValue };
}

export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** Avisos sobre o mapeamento em si (antes de olhar linha por linha) — ex.: duas colunas apontando pro mesmo alvo. */
export function getMappingWarnings(mappings: ColumnMapping[]): string[] {
  const warnings: string[] = [];
  const targetCounts = new Map<ImportTarget, number>();

  for (const m of mappings) {
    if (m.target === "IGNORAR") continue;
    targetCounts.set(m.target, (targetCounts.get(m.target) ?? 0) + 1);
  }

  for (const [target, count] of targetCounts) {
    if (count > 1) {
      warnings.push(
        target === "NOME_ALUNO"
          ? `${count} colunas estão mapeadas para "Nome do Aluno" — só a última será considerada.`
          : `${count} colunas estão mapeadas para o mesmo alvo (${target}) — só a última será considerada.`
      );
    }
  }

  return warnings;
}
