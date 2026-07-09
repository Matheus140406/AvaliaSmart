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
