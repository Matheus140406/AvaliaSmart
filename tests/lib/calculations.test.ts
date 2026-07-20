import { describe, expect, it } from "vitest";
import {
  computeWeightedAverage,
  classifyAverage,
  classifySingleValue,
} from "@/lib/grades/calculations";
import { PASSING_AVERAGE, RECOVERY_THRESHOLD } from "@/types/grade-grid";
import type { GradeConfigDTO } from "@/types/grade-grid";

function gc(id: string, weight: number): GradeConfigDTO {
  return { id, weight } as GradeConfigDTO;
}

describe("computeWeightedAverage", () => {
  it("calcula média ponderada só com as notas preenchidas", () => {
    const configs = [gc("a", 2), gc("b", 1), gc("c", 1)];
    const values: Record<string, number | null> = { a: 8, b: 5, c: null };
    const result = computeWeightedAverage(configs, (id) => values[id] ?? null);

    // (8*2 + 5*1) / (2+1) = 21/3 = 7
    expect(result.average).toBe(7);
    expect(result.filled).toBe(2);
    expect(result.total).toBe(3);
  });

  it("retorna average null quando nenhuma nota está preenchida", () => {
    const result = computeWeightedAverage([gc("a", 1)], () => null);
    expect(result.average).toBeNull();
    expect(result.filled).toBe(0);
    expect(result.total).toBe(1);
  });

  it("retorna average null com lista de configs vazia", () => {
    const result = computeWeightedAverage([], () => 10);
    expect(result.average).toBeNull();
    expect(result.total).toBe(0);
  });

  it("trata nota zero como preenchida (não como ausente)", () => {
    const result = computeWeightedAverage([gc("a", 1), gc("b", 1)], (id) => (id === "a" ? 0 : 10));
    expect(result.average).toBe(5);
    expect(result.filled).toBe(2);
  });

  it("ignora peso de configs sem nota no denominador", () => {
    // Peso alto numa nota ausente não pode puxar a média pra baixo.
    const result = computeWeightedAverage([gc("a", 10), gc("b", 1)], (id) => (id === "b" ? 6 : null));
    expect(result.average).toBe(6);
  });
});

describe("classifyAverage", () => {
  it("pendente quando não há notas", () => {
    expect(classifyAverage(null, 0)).toBe("pendente");
    expect(classifyAverage(5, 0)).toBe("pendente");
    expect(classifyAverage(null, 2)).toBe("pendente");
  });

  it("aprovado na média mínima exata", () => {
    expect(classifyAverage(PASSING_AVERAGE, 1)).toBe("aprovado");
  });

  it("recuperação entre o limiar de recuperação e a média mínima", () => {
    expect(classifyAverage(RECOVERY_THRESHOLD, 1)).toBe("recuperacao");
    expect(classifyAverage(PASSING_AVERAGE - 0.01, 1)).toBe("recuperacao");
  });

  it("reprovado abaixo do limiar de recuperação", () => {
    expect(classifyAverage(RECOVERY_THRESHOLD - 0.01, 1)).toBe("reprovado");
    expect(classifyAverage(0, 1)).toBe("reprovado");
  });
});

describe("classifySingleValue", () => {
  it("pendente para valor null", () => {
    expect(classifySingleValue(null, 10)).toBe("pendente");
  });

  it("normaliza pela nota máxima antes de classificar", () => {
    // 3 de 5 = 6 de 10 -> aprovado
    expect(classifySingleValue(3, 5)).toBe("aprovado");
    // 2 de 5 = 4 de 10 -> recuperação
    expect(classifySingleValue(2, 5)).toBe("recuperacao");
    // 1 de 5 = 2 de 10 -> reprovado
    expect(classifySingleValue(1, 5)).toBe("reprovado");
  });

  it("usa o valor cru quando maxScore é zero (sem divisão por zero)", () => {
    expect(classifySingleValue(7, 0)).toBe("aprovado");
  });
});
