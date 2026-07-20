import { describe, expect, it } from "vitest";
import { parseExternalReference } from "@/lib/billing/external-reference";

describe("parseExternalReference", () => {
  it("parseia tenantId:tier válido", () => {
    expect(parseExternalReference("tenant-123:MENSAL_BASE")).toEqual({
      tenantId: "tenant-123",
      tier: "MENSAL_BASE",
    });
  });

  it("aceita todos os tiers conhecidos", () => {
    for (const tier of ["TESTE_GRATIS", "MENSAL_BASE", "MENSAL_AVANCADO", "TRIMESTRAL", "SEMESTRAL"]) {
      expect(parseExternalReference(`t1:${tier}`)).toEqual({ tenantId: "t1", tier });
    }
  });

  it("rejeita tier desconhecido", () => {
    expect(parseExternalReference("t1:PLANO_FALSO")).toBeNull();
  });

  it("rejeita formatos malformados", () => {
    expect(parseExternalReference("")).toBeNull();
    expect(parseExternalReference("so-tenant")).toBeNull();
    expect(parseExternalReference(":MENSAL_BASE")).toBeNull();
    expect(parseExternalReference("t1:")).toBeNull();
  });

  it("rejeita não-strings (payload de webhook adulterado)", () => {
    expect(parseExternalReference(null)).toBeNull();
    expect(parseExternalReference(undefined)).toBeNull();
    expect(parseExternalReference(42)).toBeNull();
    expect(parseExternalReference({ tenantId: "t1" })).toBeNull();
  });
});
