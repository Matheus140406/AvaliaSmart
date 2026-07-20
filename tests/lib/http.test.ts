import { describe, expect, it } from "vitest";
import {
  HttpError,
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  conflict,
  paymentRequired,
} from "@/lib/http/errors";
import { apiSuccess, apiError } from "@/lib/http/api-response";

describe("HttpError factories", () => {
  it("mapeiam pro status HTTP certo", () => {
    expect(unauthorized().status).toBe(401);
    expect(forbidden().status).toBe(403);
    expect(notFound().status).toBe(404);
    expect(badRequest("x").status).toBe(400);
    expect(conflict("x").status).toBe(409);
    expect(paymentRequired("x").status).toBe(402);
  });

  it("carregam mensagem e details", () => {
    const err = badRequest("Payload inválido.", { field: "name" });
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Payload inválido.");
    expect(err.details).toEqual({ field: "name" });
  });

  it("têm mensagens default em pt-BR", () => {
    expect(unauthorized().message).toBe("Não autenticado.");
    expect(notFound().message).toBe("Recurso não encontrado.");
  });
});

describe("envelope apiSuccess/apiError", () => {
  it("apiSuccess devolve { success: true, data } com status default 200", async () => {
    const res = apiSuccess({ id: "1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { id: "1" } });
  });

  it("apiSuccess aceita status custom (201)", async () => {
    const res = apiSuccess({ ok: true }, 201);
    expect(res.status).toBe(201);
  });

  it("apiError devolve { success: false, error } sem details quando não há", async () => {
    const res = apiError("Deu ruim.", 404);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: "Deu ruim." });
  });

  it("apiError inclui details quando fornecido", async () => {
    const res = apiError("Inválido.", 400, { issues: [] });
    expect(await res.json()).toEqual({ success: false, error: "Inválido.", details: { issues: [] } });
  });
});
