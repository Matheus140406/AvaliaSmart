import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const userFindUnique = vi.fn();
const userCreate = vi.fn();
const rateLimitCount = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args),
      create: (...args: unknown[]) => userCreate(...args),
    },
    rateLimitEvent: {
      count: (...args: unknown[]) => rateLimitCount(...args),
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn(),
    },
  },
}));

import { POST } from "@/app/api/auth/register/route";

function registerRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitCount.mockResolvedValue(0); // abaixo do limite por default
});

describe("POST /api/auth/register", () => {
  it("cria usuário com dados válidos e devolve 201 no envelope padrão", async () => {
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "u1", email: "ana@escola.com" });

    const res = await POST(registerRequest({ name: "Ana", email: "Ana@Escola.com", password: "senha123" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, data: { id: "u1", email: "ana@escola.com" } });
    // E-mail normalizado pra minúsculas antes de tudo.
    expect(userFindUnique).toHaveBeenCalledWith({ where: { email: "ana@escola.com" } });
    // Nunca grava a senha em claro.
    const createArgs = userCreate.mock.calls[0][0] as { data: { passwordHash: string } };
    expect(createArgs.data.passwordHash).not.toContain("senha123");
    expect(createArgs.data.passwordHash).toMatch(/^\$2/); // bcrypt
  });

  it("rejeita senha fraca com 400 (validação server-side, não só no form)", async () => {
    for (const password of ["curta1", "somenteletras", "12345678"]) {
      const res = await POST(registerRequest({ name: "Ana", email: "a@b.com", password }));
      expect(res.status).toBe(400);
    }
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("rejeita body não-JSON com 400 em vez de 500", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/auth/register", { method: "POST", body: "não é json" })
    );
    expect(res.status).toBe(400);
  });

  it("devolve 429 quando o IP estoura o limite de cadastros", async () => {
    rateLimitCount.mockResolvedValue(5); // no limite de 5/h
    const res = await POST(registerRequest({ name: "Ana", email: "a@b.com", password: "senha123" }));
    expect(res.status).toBe(429);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("bloqueia cadastro de e-mail do allowlist de platform admin com a MESMA mensagem de conta existente", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "dono@avaliasmart.com";
    try {
      const res = await POST(
        registerRequest({ name: "Atacante", email: "Dono@AvaliaSmart.com", password: "senha123" })
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      // Indistinguível do caso "já existe" — o allowlist não pode ser sondável.
      expect(body.error).toBe("Já existe uma conta com esse e-mail. Tente entrar.");
      expect(userCreate).not.toHaveBeenCalled();
    } finally {
      delete process.env.PLATFORM_ADMIN_EMAILS;
    }
  });

  it("devolve 409 com mensagem neutra quando o e-mail já existe", async () => {
    userFindUnique.mockResolvedValue({ id: "u-existente" });
    const res = await POST(registerRequest({ name: "Ana", email: "a@b.com", password: "senha123" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Já existe uma conta com esse e-mail. Tente entrar.");
  });

  it("converte erro inesperado do banco em 500 genérico sem vazar detalhes", async () => {
    userFindUnique.mockRejectedValue(new Error("conexão recusada em 10.0.0.5:5432"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(registerRequest({ name: "Ana", email: "a@b.com", password: "senha123" }));
    spy.mockRestore();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain("10.0.0.5");
  });
});
