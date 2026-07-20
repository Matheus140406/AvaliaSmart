import type { GradeConfigDTO } from "@/types/grade-grid";
import { PASSING_AVERAGE, RECOVERY_THRESHOLD } from "@/types/grade-grid";

/**
 * Fonte única da regra de média ponderada + classificação — usada tanto pela
 * GradeGrid (client, tempo real a cada tecla) quanto pelo export de PDF
 * (server, no fechamento do período). Extraído de propósito: se essa regra
 * divergir entre os dois lugares, o boletim impresso pode discordar do que o
 * professor vê na tela, e ninguém percebe até um responsável reclamar.
 */

export type GradeStatus = "aprovado" | "recuperacao" | "reprovado" | "pendente";

export interface WeightedAverageResult {
  average: number | null;
  filled: number;
  total: number;
}

export function computeWeightedAverage(
  gradeConfigs: GradeConfigDTO[],
  getValue: (gradeConfigId: string) => number | null
): WeightedAverageResult {
  let weightedSum = 0;
  let weightTotal = 0;
  let filled = 0;

  for (const gc of gradeConfigs) {
    const value = getValue(gc.id);
    if (value !== null) {
      weightedSum += value * gc.weight;
      weightTotal += gc.weight;
      filled += 1;
    }
  }

  return {
    average: weightTotal > 0 ? weightedSum / weightTotal : null,
    filled,
    total: gradeConfigs.length,
  };
}

export function classifyAverage(average: number | null, filled: number): GradeStatus {
  if (filled === 0 || average === null) return "pendente";
  if (average >= PASSING_AVERAGE) return "aprovado";
  if (average >= RECOVERY_THRESHOLD) return "recuperacao";
  return "reprovado";
}

/**
 * Média final da disciplina (aritmética das médias bimestrais/trimestrais
 * já fechadas) — mesma regra usada pelo boletim (route.tsx de export/pdf/
 * boletim) e agora também pela Ata de Resultados Finais, extraída aqui pra
 * as duas nunca divergirem.
 */
export function computeFinalAverage(termAverages: { average: number | null }[]): number | null {
  const filled = termAverages.filter((t) => t.average !== null).map((t) => t.average as number);
  return filled.length > 0 ? filled.reduce((sum, v) => sum + v, 0) / filled.length : null;
}

/**
 * Situação final consolidada de um aluno a partir do status de cada
 * disciplina — usada pela Ata de Resultados Finais (uma linha por aluno,
 * uma situação só, não uma por disciplina). Reprovado em qualquer
 * disciplina reprova o aluno geral; sem nenhuma reprovação mas com alguma
 * recuperação, o consolidado fica em recuperação; só aprova de fato se
 * TODAS as disciplinas com nota estiverem aprovadas.
 */
export function consolidateFinalStatus(subjectStatuses: GradeStatus[]): GradeStatus {
  if (subjectStatuses.length === 0 || subjectStatuses.every((s) => s === "pendente")) return "pendente";
  if (subjectStatuses.includes("reprovado")) return "reprovado";
  if (subjectStatuses.includes("recuperacao")) return "recuperacao";
  if (subjectStatuses.some((s) => s === "aprovado")) return "aprovado";
  return "pendente";
}

export function classifySingleValue(value: number | null, maxScore: number): GradeStatus {
  if (value === null) return "pendente";
  const normalized = maxScore > 0 ? (value / maxScore) * 10 : value;
  return classifyAverage(normalized, 1);
}

export const GRADE_STATUS_LABEL: Record<GradeStatus, string> = {
  aprovado: "Aprovado",
  recuperacao: "Recuperação",
  reprovado: "Reprovado",
  pendente: "Pendente",
};
