import { describe, expect, it } from "vitest";
import { base32Encode } from "@/lib/mfa/base32";
import { totpCodeAt, verifyTotpCode, generateTotpSecret, buildOtpAuthUri } from "@/lib/mfa/totp";

/**
 * Vetores de teste OFICIAIS do RFC 6238 (Apêndice B, caso SHA1): segredo
 * ASCII "12345678901234567890" (20 bytes), 8 dígitos, passo de 30s. Validam
 * a implementação de HOTP/TOTP (HMAC-SHA1 + truncamento dinâmico) contra a
 * especificação, não só contra ela mesma.
 */
const RFC_SECRET_BASE32 = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("totpCodeAt — vetores oficiais do RFC 6238 (Apêndice B, SHA1)", () => {
  const vectors: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ];

  it.each(vectors)("T=%i -> %s", (unixSeconds, expected) => {
    expect(totpCodeAt(RFC_SECRET_BASE32, unixSeconds, { digits: 8 })).toBe(expected);
  });
});

describe("verifyTotpCode", () => {
  it("aceita o código do passo atual", () => {
    const now = 1700000000;
    const code = totpCodeAt(RFC_SECRET_BASE32, now, { digits: 8 });
    expect(verifyTotpCode(RFC_SECRET_BASE32, code, { digits: 8, nowSeconds: now })).toBe(true);
  });

  it("aceita o código do passo anterior e do seguinte (janela ±1 = ±30s)", () => {
    const now = 1700000000;
    const prevCode = totpCodeAt(RFC_SECRET_BASE32, now - 30, { digits: 8 });
    const nextCode = totpCodeAt(RFC_SECRET_BASE32, now + 30, { digits: 8 });
    expect(verifyTotpCode(RFC_SECRET_BASE32, prevCode, { digits: 8, nowSeconds: now })).toBe(true);
    expect(verifyTotpCode(RFC_SECRET_BASE32, nextCode, { digits: 8, nowSeconds: now })).toBe(true);
  });

  it("rejeita um código de dois passos atrás (fora da janela de tolerância)", () => {
    const now = 1700000000;
    const staleCode = totpCodeAt(RFC_SECRET_BASE32, now - 60, { digits: 8 });
    expect(verifyTotpCode(RFC_SECRET_BASE32, staleCode, { digits: 8, nowSeconds: now })).toBe(false);
  });

  it("rejeita código com formato inválido (não numérico)", () => {
    expect(verifyTotpCode(RFC_SECRET_BASE32, "abcdef", { digits: 6 })).toBe(false);
  });

  it("rejeita um segredo diferente", () => {
    const now = 1700000000;
    const otherSecret = generateTotpSecret();
    const code = totpCodeAt(RFC_SECRET_BASE32, now, { digits: 8 });
    expect(verifyTotpCode(otherSecret, code, { digits: 8, nowSeconds: now })).toBe(false);
  });
});

describe("generateTotpSecret", () => {
  it("gera segredos diferentes a cada chamada, só com caracteres base32 válidos", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z2-7]+$/);
  });
});

describe("buildOtpAuthUri", () => {
  it("monta a URI otpauth:// com issuer, label e parâmetros padrão", () => {
    const uri = buildOtpAuthUri({ secretBase32: "JBSWY3DPEHPK3PXP", accountLabel: "prof@escola.com", issuer: "AvaliaSmart" });
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=AvaliaSmart");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
