import { describe, expect, it } from "vitest";
import { timingSafeStringEqual } from "@/lib/billing/timing-safe";

describe("timingSafeStringEqual", () => {
  it("aceita strings idênticas", () => {
    expect(timingSafeStringEqual("token-secreto-123", "token-secreto-123")).toBe(true);
  });

  it("rejeita strings diferentes, inclusive de tamanhos distintos (sem lançar)", () => {
    expect(timingSafeStringEqual("abc", "abd")).toBe(false);
    expect(timingSafeStringEqual("abc", "abcdef")).toBe(false);
    expect(timingSafeStringEqual("", "x")).toBe(false);
  });

  it("é sensível a maiúsculas/minúsculas (tokens são exatos)", () => {
    expect(timingSafeStringEqual("Token", "token")).toBe(false);
  });
});
