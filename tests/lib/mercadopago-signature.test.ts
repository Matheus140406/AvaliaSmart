import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMercadoPagoSignature } from "@/lib/billing/mercadopago";

const SECRET = "test-webhook-secret";

function sign(manifest: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

function makeSignature(params: { dataId: string; requestId: string; ts: string; secret?: string }) {
  // O manifest replica o formato do código de produção — inclusive a
  // normalização pra minúsculas do dataId (comportamento documentado no
  // próprio mercadopago.ts como o ponto mais frágil da integração; este
  // teste FIXA esse comportamento, não o endossa).
  const manifest = `id:${params.dataId.toLowerCase()};request-id:${params.requestId};ts:${params.ts};`;
  return `ts=${params.ts},v1=${sign(manifest, params.secret)}`;
}

describe("verifyMercadoPagoSignature", () => {
  it("aceita assinatura válida", () => {
    const xSignature = makeSignature({ dataId: "12345", requestId: "req-1", ts: "1700000000" });
    expect(
      verifyMercadoPagoSignature({ xSignature, xRequestId: "req-1", dataId: "12345", secret: SECRET })
    ).toBe(true);
  });

  it("normaliza dataId pra minúsculas antes de assinar (comportamento atual)", () => {
    const xSignature = makeSignature({ dataId: "abc123", requestId: "req-1", ts: "1700000000" });
    expect(
      verifyMercadoPagoSignature({ xSignature, xRequestId: "req-1", dataId: "ABC123", secret: SECRET })
    ).toBe(true);
  });

  it("rejeita assinatura com secret errado", () => {
    const xSignature = makeSignature({ dataId: "1", requestId: "r", ts: "1", secret: "outro" });
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: "r", dataId: "1", secret: SECRET })).toBe(
      false
    );
  });

  it("rejeita quando o dataId difere do assinado", () => {
    const xSignature = makeSignature({ dataId: "111", requestId: "r", ts: "1" });
    expect(verifyMercadoPagoSignature({ xSignature, xRequestId: "r", dataId: "222", secret: SECRET })).toBe(
      false
    );
  });

  it("rejeita headers ausentes ou malformados", () => {
    expect(
      verifyMercadoPagoSignature({ xSignature: null, xRequestId: "r", dataId: "1", secret: SECRET })
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({ xSignature: "ts=1", xRequestId: "r", dataId: "1", secret: SECRET })
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({ xSignature: "lixo", xRequestId: null, dataId: "1", secret: SECRET })
    ).toBe(false);
  });

  it("rejeita v1 de comprimento diferente sem lançar (timingSafeEqual protegido)", () => {
    expect(
      verifyMercadoPagoSignature({ xSignature: "ts=1,v1=abc", xRequestId: "r", dataId: "1", secret: SECRET })
    ).toBe(false);
  });
});
