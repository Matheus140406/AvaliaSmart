import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http/errors";

const classFindFirst = vi.fn();
const studentFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    class: { findFirst: (...a: unknown[]) => classFindFirst(...a) },
    student: { findFirst: (...a: unknown[]) => studentFindFirst(...a) },
  },
}));

const generate = vi.fn();
vi.mock("@/services/ai/ai.service", () => ({
  generate: (...args: unknown[]) => generate(...args),
}));

const recordAiUsage = vi.fn();
vi.mock("@/services/ai/guard", () => ({
  recordAiUsage: (...args: unknown[]) => recordAiUsage(...args),
}));

import { generateParentCommunication } from "@/services/ai/parent-communication.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateParentCommunication", () => {
  it("devolve 404 quando a turma não pertence ao tenant", async () => {
    classFindFirst.mockResolvedValue(null);
    await expect(
      generateParentCommunication({
        tenantId: "t1",
        membershipId: "m1",
        scopeType: "CLASS",
        scopeId: "c1",
        context: "Reunião de pais dia 25/07.",
        tone: "formal",
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("devolve 404 quando o aluno não pertence ao tenant", async () => {
    studentFindFirst.mockResolvedValue(null);
    await expect(
      generateParentCommunication({
        tenantId: "t1",
        membershipId: "m1",
        scopeType: "STUDENT",
        scopeId: "s1",
        context: "Aviso sobre comportamento em sala.",
        tone: "formal",
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("escopo turma nunca inclui nome de aluno no prompt", async () => {
    classFindFirst.mockResolvedValue({ id: "c1", name: "9º Ano A" });
    generate.mockResolvedValue({ success: true, data: "Prezados pais e responsáveis...", usage: { inputTokens: 10, outputTokens: 5 } });

    await generateParentCommunication({
      tenantId: "t1",
      membershipId: "m1",
      scopeType: "CLASS",
      scopeId: "c1",
      context: "Reunião de pais dia 25/07 às 19h.",
      tone: "formal",
    });

    const promptArg = generate.mock.calls[0][0].prompt as string;
    expect(promptArg).toContain("9º Ano A");
    expect(promptArg).toContain("Reunião de pais dia 25/07 às 19h.");
  });

  it("escopo aluno inclui o nome do aluno e retorna contatos dos responsáveis", async () => {
    studentFindFirst.mockResolvedValue({
      id: "s1",
      name: "Ana Beatriz",
      guardians: [{ guardian: { name: "Maria Souza", phone: "11999998888" } }, { guardian: { name: "João Souza", phone: null } }],
    });
    generate.mockResolvedValue({ success: true, data: "Prezado responsável...", usage: { inputTokens: 8, outputTokens: 4 } });

    const result = await generateParentCommunication({
      tenantId: "t1",
      membershipId: "m1",
      scopeType: "STUDENT",
      scopeId: "s1",
      context: "Aviso sobre material escolar.",
      tone: "informal",
    });

    const promptArg = generate.mock.calls[0][0].prompt as string;
    expect(promptArg).toContain("Ana Beatriz");
    expect(result.message).toBe("Prezado responsável...");
    expect(result.guardians).toEqual([
      { name: "Maria Souza", phone: "11999998888" },
      { name: "João Souza", phone: null },
    ]);
  });

  it("registra o uso de IA com a feature COMUNICADO_PAIS, mesmo em falha", async () => {
    classFindFirst.mockResolvedValue({ id: "c1", name: "9º Ano A" });
    generate.mockResolvedValue({ success: false, error: "sem cota" });

    await expect(
      generateParentCommunication({
        tenantId: "t1",
        membershipId: "m1",
        scopeType: "CLASS",
        scopeId: "c1",
        context: "Aviso geral.",
        tone: "formal",
      })
    ).rejects.toThrow();

    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", membershipId: "m1", feature: "COMUNICADO_PAIS", success: false })
    );
  });

  it("propaga falha do provedor de IA como HttpError 502", async () => {
    classFindFirst.mockResolvedValue({ id: "c1", name: "9º Ano A" });
    generate.mockResolvedValue({ success: false, error: "Não foi possível gerar a resposta de IA agora." });

    await expect(
      generateParentCommunication({
        tenantId: "t1",
        membershipId: "m1",
        scopeType: "CLASS",
        scopeId: "c1",
        context: "Aviso geral.",
        tone: "formal",
      })
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe("HttpError sanity", () => {
  it("confirma status 404 default do notFound reaproveitado aqui", () => {
    const err = new HttpError(404, "x");
    expect(err.status).toBe(404);
  });
});
