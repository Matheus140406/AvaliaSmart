import { describe, expect, it } from "vitest";
import { computeFinalAverage, consolidateFinalStatus } from "@/lib/grades/calculations";

describe("computeFinalAverage", () => {
  it("média aritmética só dos períodos com nota", () => {
    expect(computeFinalAverage([{ average: 8 }, { average: 6 }])).toBe(7);
  });

  it("ignora períodos sem nota (null)", () => {
    expect(computeFinalAverage([{ average: 8 }, { average: null }, { average: 4 }])).toBe(6);
  });

  it("devolve null quando nenhum período tem nota", () => {
    expect(computeFinalAverage([{ average: null }, { average: null }])).toBeNull();
  });

  it("devolve null pra lista vazia", () => {
    expect(computeFinalAverage([])).toBeNull();
  });
});

describe("consolidateFinalStatus (Ata de Resultados Finais)", () => {
  it("reprovado se QUALQUER disciplina estiver reprovada, mesmo com outras aprovadas", () => {
    expect(consolidateFinalStatus(["aprovado", "reprovado", "aprovado"])).toBe("reprovado");
  });

  it("recuperação se nenhuma reprovada mas alguma em recuperação", () => {
    expect(consolidateFinalStatus(["aprovado", "recuperacao"])).toBe("recuperacao");
  });

  it("aprovado quando todas as disciplinas estão aprovadas", () => {
    expect(consolidateFinalStatus(["aprovado", "aprovado"])).toBe("aprovado");
  });

  it("pendente quando não há nenhuma disciplina ou todas pendentes", () => {
    expect(consolidateFinalStatus([])).toBe("pendente");
    expect(consolidateFinalStatus(["pendente", "pendente"])).toBe("pendente");
  });

  it("prioriza reprovado sobre pendente quando misturado", () => {
    expect(consolidateFinalStatus(["pendente", "reprovado"])).toBe("reprovado");
  });

  it("aprovado quando mistura aprovado com pendente (sem reprovado/recuperação)", () => {
    expect(consolidateFinalStatus(["aprovado", "pendente"])).toBe("aprovado");
  });
});
