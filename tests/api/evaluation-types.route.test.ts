import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.fn();

// Mocka o módulo de auth inteiro — evita carregar a config real do NextAuth
// (que exige AUTH_SECRET/adapter) e permite simular sessões por teste.
vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

vi.mock("@/repositories/evaluation-type.repository", () => ({
  listEvaluationTypes: vi.fn(),
  findEvaluationTypeById: vi.fn(),
  findEvaluationTypeByName: vi.fn(),
  nextEvaluationTypeOrder: vi.fn(),
  createEvaluationType: vi.fn(),
  updateEvaluationType: vi.fn(),
  countGradeConfigsUsingType: vi.fn(),
  deleteEvaluationType: vi.fn(),
}));

import * as repo from "@/repositories/evaluation-type.repository";
import { GET, POST } from "@/app/api/evaluation-types/route";

const mocked = vi.mocked(repo);

function professor() {
  return { id: "m1", tenantId: "t1", role: "PROFESSOR" };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/evaluation-types (via withTenant)", () => {
  it("devolve 401 sem sessão", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/evaluation-types"), {});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Não autenticado." });
  });

  it("lista só ativos por default e todos com ?includeInactive=1", async () => {
    getCurrentUser.mockResolvedValue(professor());
    mocked.listEvaluationTypes.mockResolvedValue([] as never);

    await GET(new NextRequest("http://localhost/api/evaluation-types"), {});
    expect(mocked.listEvaluationTypes).toHaveBeenLastCalledWith("t1", false);

    await GET(new NextRequest("http://localhost/api/evaluation-types?includeInactive=1"), {});
    expect(mocked.listEvaluationTypes).toHaveBeenLastCalledWith("t1", true);
  });
});

describe("POST /api/evaluation-types", () => {
  function postRequest(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/evaluation-types", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("devolve 403 pra papel sem permissão de escrita", async () => {
    getCurrentUser.mockResolvedValue({ id: "m1", tenantId: "t1", role: "RESPONSAVEL" });
    const res = await POST(postRequest({ name: "Prova" }), {});
    expect(res.status).toBe(403);
  });

  it("devolve 400 pra payload inválido (Zod) no envelope padrão", async () => {
    getCurrentUser.mockResolvedValue(professor());
    const res = await POST(postRequest({ name: "" }), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  it("cria e devolve 201 pra papel com escrita", async () => {
    getCurrentUser.mockResolvedValue(professor());
    mocked.findEvaluationTypeByName.mockResolvedValue(null);
    mocked.nextEvaluationTypeOrder.mockResolvedValue(1);
    mocked.createEvaluationType.mockResolvedValue({ id: "et1", name: "Prova" } as never);

    const res = await POST(postRequest({ name: "Prova" }), {});
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, data: { id: "et1", name: "Prova" } });
  });

  it("HttpError do service vira resposta padronizada (409 de duplicado)", async () => {
    getCurrentUser.mockResolvedValue(professor());
    mocked.findEvaluationTypeByName.mockResolvedValue({ id: "et-existente" } as never);
    const res = await POST(postRequest({ name: "Prova" }), {});
    expect(res.status).toBe(409);
  });
});
