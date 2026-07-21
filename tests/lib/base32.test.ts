import { describe, expect, it } from "vitest";
import { base32Encode, base32Decode } from "@/lib/mfa/base32";

describe("base32Encode/base32Decode", () => {
  it("roda em ida e volta pra buffers de vários tamanhos", () => {
    for (const text of ["", "f", "fo", "foo", "foob", "fooba", "foobar", "12345678901234567890"]) {
      const buffer = Buffer.from(text, "ascii");
      const encoded = base32Encode(buffer);
      expect(base32Decode(encoded)).toEqual(buffer);
    }
  });

  it("usa só o alfabeto RFC 4648 (A-Z, 2-7)", () => {
    const encoded = base32Encode(Buffer.from("qualquer texto de teste aqui", "utf8"));
    expect(encoded).toMatch(/^[A-Z2-7]+$/);
  });

  it("decode ignora hífen, espaço e é case-insensitive (formato que o usuário poderia colar)", () => {
    const original = Buffer.from("segredo-totp-123", "ascii");
    const encoded = base32Encode(original);
    const messy = `${encoded.slice(0, 4)}-${encoded.slice(4, 8)} ${encoded.slice(8)}`.toLowerCase();
    expect(base32Decode(messy)).toEqual(original);
  });

  it("decode de string vazia devolve buffer vazio", () => {
    expect(base32Decode("").length).toBe(0);
  });
});
