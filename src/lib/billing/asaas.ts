/**
 * Cliente da API do Asaas (v3) — assinaturas recorrentes.
 *
 * Verificado contra docs.asaas.com (jul/2026):
 * - Auth: header `access_token`. Chave sandbox começa com $aact_hmlg_,
 *   produção com $aact_prod_ — o ambiente é deduzido do prefixo da chave,
 *   então não dá pra apontar chave de um ambiente pra URL do outro por engano.
 * - Assinatura = agendador de cobranças: POST /v3/subscriptions cria a
 *   assinatura E a primeira cobrança automaticamente; a URL de pagamento
 *   (invoiceUrl) vem de GET /v3/subscriptions/{id}/payments (segunda chamada,
 *   por design da API — o id da cobrança não vem na criação).
 * - billingType UNDEFINED deixa o cliente escolher Pix/boleto/cartão na
 *   própria fatura do Asaas — sem precisarmos de UI de pagamento própria.
 */

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

const SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const PRODUCTION_URL = "https://api.asaas.com/v3";

/**
 * BUG CORRIGIDO: o código antigo tratava "não começa com $aact_hmlg_" como
 * sinônimo de produção — uma chave sandbox digitada errado, um formato novo
 * do Asaas, ou o override abaixo ausente caíam SILENCIOSAMENTE na URL de
 * produção com credencial de teste. Agora produção é reconhecida
 * explicitamente pelo prefixo dela também, e prefixo desconhecido avisa alto
 * (não só decide por baixo do capô) antes de cair no default de produção —
 * `ASAAS_ENV` permite forçar o ambiente sem depender do prefixo.
 */
function baseUrl(): string {
  if (!ASAAS_API_KEY) throw new Error("ASAAS_API_KEY não configurada.");

  const override = process.env.ASAAS_ENV;
  if (override === "sandbox") return SANDBOX_URL;
  if (override === "production") return PRODUCTION_URL;

  if (ASAAS_API_KEY.startsWith("$aact_hmlg_")) return SANDBOX_URL;
  if (ASAAS_API_KEY.startsWith("$aact_prod_")) return PRODUCTION_URL;

  console.warn(
    "[asaas] ASAAS_API_KEY não tem prefixo $aact_hmlg_ (sandbox) nem $aact_prod_ (produção) reconhecido — " +
      "assumindo PRODUÇÃO por padrão. Se isso não for intencional, defina ASAAS_ENV=sandbox|production explicitamente."
  );
  return PRODUCTION_URL;
}

export function isAsaasConfigured(): boolean {
  return Boolean(ASAAS_API_KEY);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function asaasFetch(path: string, init?: { method?: string; body?: any }): Promise<any> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      access_token: ASAAS_API_KEY as string,
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const description =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any)?.errors?.[0]?.description ?? `Asaas respondeu HTTP ${response.status}.`;
    throw new Error(description);
  }
  return data;
}

export interface AsaasCustomerInput {
  name: string;
  email: string;
  cpfCnpj: string;
}

/** Cria (ou reaproveita, se já existir pelo cpfCnpj) o cliente no Asaas. */
export async function ensureAsaasCustomer(input: AsaasCustomerInput): Promise<string> {
  // A API permite buscar por cpfCnpj — evita criar cliente duplicado se o
  // admin tentar assinar duas vezes.
  const existing = await asaasFetch(`/customers?cpfCnpj=${encodeURIComponent(input.cpfCnpj)}&limit=1`);
  if (existing?.data?.[0]?.id) return existing.data[0].id as string;

  const created = await asaasFetch("/customers", { method: "POST", body: input });
  return created.id as string;
}

export interface CreateSubscriptionInput {
  customerId: string;
  valueCents: number;
  cycle: "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";
  description: string;
  /** Vai no externalReference — é como o webhook liga o pagamento de volta ao tenant+plano. */
  externalReference: string;
}

export async function createAsaasSubscription(input: CreateSubscriptionInput): Promise<{
  subscriptionId: string;
  invoiceUrl: string | null;
}> {
  const today = new Date();
  const nextDueDate = today.toISOString().slice(0, 10); // primeira cobrança: hoje

  const subscription = await asaasFetch("/subscriptions", {
    method: "POST",
    body: {
      customer: input.customerId,
      billingType: "UNDEFINED", // cliente escolhe Pix/boleto/cartão na fatura
      nextDueDate,
      value: input.valueCents / 100,
      cycle: input.cycle,
      description: input.description,
      externalReference: input.externalReference,
    },
  });

  // A primeira cobrança é criada junto, mas o id dela não vem na resposta da
  // criação (design da API) — segunda chamada pra pegar a invoiceUrl.
  const payments = await asaasFetch(`/subscriptions/${subscription.id}/payments`);
  const invoiceUrl: string | null = payments?.data?.[0]?.invoiceUrl ?? null;

  return { subscriptionId: subscription.id as string, invoiceUrl };
}
