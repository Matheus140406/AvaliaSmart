import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cliente da API do Mercado Pago — assinaturas via /preapproval.
 *
 * Verificado contra developers.mercadopago.com (jul/2026):
 * - Assinatura recorrente usa /preapproval, NÃO /checkout/preferences (que é
 *   cobrança avulsa — é o que veio no exemplo que você colou).
 * - "Assinatura sem plano associado": manda `auto_recurring` inline na
 *   criação, sem precisar pré-cadastrar um preapproval_plan no painel.
 * - Sem `card_token_id`/`status: "authorized"` (que são pro fluxo onde VOCÊ
 *   já coletou o cartão via Checkout Bricks no seu front), a resposta traz
 *   `init_point`: a página hospedada do MP onde a pessoa autoriza a
 *   assinatura — mesmo papel que o `invoiceUrl` do Asaas.
 * - Webhook é ENXUTO: só `{ type, data: { id } }` — o valor de verdade
 *   (status do pagamento) exige uma segunda chamada (GET) pro recurso.
 */

const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const API_BASE = "https://api.mercadopago.com";

export function isMercadoPagoConfigured(): boolean {
  return Boolean(ACCESS_TOKEN);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function mpFetch(path: string, init?: { method?: string; body?: any }): Promise<any> {
  if (!ACCESS_TOKEN) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");

  const response = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = (data as any)?.message ?? `Mercado Pago respondeu HTTP ${response.status}.`;
    throw new Error(message);
  }
  return data;
}

export interface CreatePreapprovalInput {
  payerEmail: string;
  reason: string;
  valueCents: number;
  frequencyType: "months" | "years";
  /** Quantas unidades de `frequencyType` por ciclo — ex: 3 pro trimestral (a cada 3 meses). MP aceita 1-12 pra "months". */
  frequencyCount: number;
  backUrl: string;
  /** Vai no external_reference — é como o webhook liga o pagamento de volta ao tenant+plano. */
  externalReference: string;
}

export async function createMercadoPagoSubscription(
  input: CreatePreapprovalInput
): Promise<{ preapprovalId: string; initPoint: string | null }> {
  const result = await mpFetch("/preapproval", {
    method: "POST",
    body: {
      reason: input.reason,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      auto_recurring: {
        frequency: input.frequencyCount,
        frequency_type: input.frequencyType,
        transaction_amount: input.valueCents / 100,
        currency_id: "BRL",
      },
    },
  });

  // Credencial TEST- (sandbox) recebe `sandbox_init_point` — o `init_point`
  // "de produção" que o MP também devolve nesse caso não aceita pagador de
  // teste. BUG CORRIGIDO: o código antigo só lia `init_point`, então testes
  // com credencial TEST- caíam no checkout de produção e o pagamento de
  // teste era rejeitado.
  const isTestCredential = ACCESS_TOKEN?.startsWith("TEST-") ?? false;
  const initPoint = isTestCredential
    ? (result.sandbox_init_point as string | undefined) ?? (result.init_point as string | undefined)
    : (result.init_point as string | undefined) ?? (result.sandbox_init_point as string | undefined);

  return { preapprovalId: result.id as string, initPoint: initPoint ?? null };
}

/** Busca o recurso completo de um pagamento — o webhook só manda o ID. */
export async function fetchMercadoPagoPayment(paymentId: string) {
  return mpFetch(`/v1/payments/${paymentId}`);
}

export async function fetchMercadoPagoPreapproval(preapprovalId: string) {
  return mpFetch(`/preapproval/${preapprovalId}`);
}

/**
 * Validação de assinatura do webhook (header `x-signature`).
 *
 * >>> PONTO DE MAIOR RISCO DE SUTILEZA DESTA INTEGRAÇÃO <<<
 * O manifest usado no HMAC é `id:{dataId};request-id:{xRequestId};ts:{ts};`
 * — moldado a partir dos exemplos oficiais, mas o Mercado Pago já teve
 * relatos de discrepância de maiúsculas/minúsculas no `dataId` entre
 * ambientes (visto em discussões da comunidade nos SDKs oficiais). Teste
 * isso com o simulador de webhooks do painel MP (Suas integrações >
 * Webhooks > Simular) antes de confiar nele em produção — se a validação
 * falhar sempre, o primeiro suspeito é essa normalização de case.
 */
export function verifyMercadoPagoSignature(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string;
  secret: string;
}): boolean {
  if (!params.xSignature || !params.xRequestId || !params.dataId) return false;

  const parts: Record<string, string> = {};
  for (const pair of params.xSignature.split(",")) {
    const [key, value] = pair.split("=");
    if (key && value) parts[key.trim()] = value.trim();
  }
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${params.dataId.toLowerCase()};request-id:${params.xRequestId};ts:${ts};`;
  const computed = createHmac("sha256", params.secret).update(manifest).digest("hex");

  const computedBuf = Buffer.from(computed);
  const receivedBuf = Buffer.from(v1);
  if (computedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(computedBuf, receivedBuf);
}
