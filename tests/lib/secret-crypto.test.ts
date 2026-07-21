import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/mfa/secret-crypto";

describe("encryptSecret/decryptSecret", () => {
  beforeEach(() => {
    process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("roda em ida e volta", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptSecret(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("gera ciphertext diferente a cada chamada (IV aleatório) mesmo pro mesmo texto", () => {
    const a = encryptSecret("mesmo-segredo");
    const b = encryptSecret("mesmo-segredo");
    expect(a).not.toBe(b);
  });

  it("rejeita ciphertext adulterado (auth tag do GCM não bate)", () => {
    const encrypted = encryptSecret("segredo-importante");
    const [iv, authTag, ciphertext] = encrypted.split(".");
    const tamperedCiphertext = Buffer.from(ciphertext, "base64");
    tamperedCiphertext[0] ^= 0xff; // flip de 1 bit
    const tampered = [iv, authTag, tamperedCiphertext.toString("base64")].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("lança HttpError 500 quando MFA_ENCRYPTION_KEY não está configurada", () => {
    delete process.env.MFA_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow();
  });

  it("lança HttpError 500 quando MFA_ENCRYPTION_KEY não tem 32 bytes", () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.from("chave-curta-demais").toString("base64");
    expect(() => encryptSecret("x")).toThrow();
  });
});
