import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  delete process.env.ASAAS_API_KEY;
  delete process.env.ASAAS_ENV;
});

describe("createMercadoPagoSubscription — escolha de init_point", () => {
  it("credencial TEST- usa sandbox_init_point quando disponível (BUG CORRIGIDO)", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-abc123";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "p1", init_point: "https://prod.mp/x", sandbox_init_point: "https://sandbox.mp/x" }),
    });

    const { createMercadoPagoSubscription } = await import("@/lib/billing/mercadopago");
    const result = await createMercadoPagoSubscription({
      payerEmail: "a@b.com",
      reason: "teste",
      valueCents: 1000,
      frequencyType: "months",
      frequencyCount: 1,
      backUrl: "https://app/back",
      externalReference: "t1:MENSAL_BASE",
    });

    expect(result.initPoint).toBe("https://sandbox.mp/x");
  });

  it("credencial de produção (APP_USR-) usa init_point normal", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-abc123";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "p1", init_point: "https://prod.mp/x", sandbox_init_point: "https://sandbox.mp/x" }),
    });

    const { createMercadoPagoSubscription } = await import("@/lib/billing/mercadopago");
    const result = await createMercadoPagoSubscription({
      payerEmail: "a@b.com",
      reason: "teste",
      valueCents: 1000,
      frequencyType: "months",
      frequencyCount: 1,
      backUrl: "https://app/back",
      externalReference: "t1:MENSAL_BASE",
    });

    expect(result.initPoint).toBe("https://prod.mp/x");
  });

  it("credencial TEST- cai pro init_point se sandbox_init_point não vier na resposta", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-abc123";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "p1", init_point: "https://prod.mp/x" }) });

    const { createMercadoPagoSubscription } = await import("@/lib/billing/mercadopago");
    const result = await createMercadoPagoSubscription({
      payerEmail: "a@b.com",
      reason: "teste",
      valueCents: 1000,
      frequencyType: "months",
      frequencyCount: 1,
      backUrl: "https://app/back",
      externalReference: "t1:MENSAL_BASE",
    });

    expect(result.initPoint).toBe("https://prod.mp/x");
  });
});

describe("Asaas — resolução de ambiente (baseUrl)", () => {
  async function callEnsureCustomer() {
    const { ensureAsaasCustomer } = await import("@/lib/billing/asaas");
    return ensureAsaasCustomer({ name: "Ana", email: "a@b.com", cpfCnpj: "123" });
  }

  beforeEach(() => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: "cus_1" }] }) });
  });

  it("chave $aact_hmlg_ usa a URL de sandbox", async () => {
    process.env.ASAAS_API_KEY = "$aact_hmlg_123";
    await callEnsureCustomer();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("api-sandbox.asaas.com"), expect.anything());
  });

  it("chave $aact_prod_ usa a URL de produção", async () => {
    process.env.ASAAS_API_KEY = "$aact_prod_123";
    await callEnsureCustomer();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("//api.asaas.com"), expect.anything());
  });

  it("ASAAS_ENV=sandbox força sandbox mesmo com chave de prefixo desconhecido", async () => {
    process.env.ASAAS_API_KEY = "chave-sem-prefixo-conhecido";
    process.env.ASAAS_ENV = "sandbox";
    await callEnsureCustomer();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("api-sandbox.asaas.com"), expect.anything());
  });

  it("prefixo desconhecido sem ASAAS_ENV avisa no console e cai em produção (comportamento documentado)", async () => {
    process.env.ASAAS_API_KEY = "chave-sem-prefixo-conhecido";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await callEnsureCustomer();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("//api.asaas.com"), expect.anything());
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("assumindo PRODUÇÃO"));
    warnSpy.mockRestore();
  });
});
