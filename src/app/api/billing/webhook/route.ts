import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findPlanByTier } from "@/repositories/plan.repository";
import { parseExternalReference } from "@/lib/billing/external-reference";
import { withWebhookIdempotency } from "@/lib/billing/webhook-idempotency";
import { sendEmail, paymentReceivedEmail } from "@/lib/email/resend";
import { renderReceiptPdf } from "@/services/billing/receipt.service";

/**
 * POST /api/billing/webhook — recebe eventos de COBRANÇA do Asaas.
 *
 * Três regras da plataforma (verificadas nas docs) moldam este handler:
 *
 * 1. NÃO existe webhook de "assinatura paga" — o Asaas só notifica eventos
 *    de cobrança; o campo `payment.subscription`/`externalReference` é o que
 *    liga de volta à assinatura e ao tenant.
 * 2. Entrega "at least once": o mesmo evento pode chegar 2+ vezes — por
 *    isso todo evento passa por `withWebhookIdempotency`
 *    (gateway="asaas", eventId="{eventType}:{payment.id}") antes de
 *    qualquer efeito colateral. O carimbo de "processado" e a mutação da
 *    Subscription rodam na MESMA transação — se a mutação falhar, o
 *    carimbo é desfeito junto, então uma reentrega genuína reprocessa.
 * 3. 15 respostas não-2xx consecutivas PAUSAM a fila inteira de webhooks da
 *    conta — por isso evento desconhecido, payload estranho ou tenant não
 *    encontrado respondem 200 (com log), nunca 4xx/5xx. O único 401 é token
 *    inválido, que é de fato outra origem chamando.
 *
 * Rota PÚBLICA (Asaas chama de fora) — autenticada pelo header
 * `asaas-access-token`, comparado com ASAAS_WEBHOOK_TOKEN (definido por você
 * ao cadastrar o webhook no painel/API do Asaas).
 *
 * Eventos tratados:
 * - PAYMENT_CONFIRMED / PAYMENT_RECEIVED -> ativa o plano do externalReference
 *   (CONFIRMED = pagamento reconhecido ex.: cartão; RECEIVED = dinheiro em
 *   conta ex.: Pix/boleto — o primeiro dos dois que chegar já ativa)
 * - PAYMENT_OVERDUE -> marca INADIMPLENTE (os guards passam a bloquear)
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (expectedToken) {
    const receivedToken = request.headers.get("asaas-access-token");
    if (receivedToken !== expectedToken) {
      return NextResponse.json({ success: false, error: "Token inválido." }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Sem token configurado em produção = qualquer um poderia se auto-ativar
    // um plano forjando o POST. Recusa tudo até configurar.
    console.error("[asaas-webhook] ASAAS_WEBHOOK_TOKEN não configurado em produção — evento recusado.");
    return NextResponse.json({ success: false, error: "Webhook não configurado." }, { status: 401 });
  }

  const event = await request.json().catch(() => null);
  if (!event?.event) {
    return NextResponse.json({ success: true, data: { ignored: true } }); // payload estranho: 200 pra não travar a fila
  }

  const eventType: string = event.event;
  const payment = event.payment ?? {};

  try {
    switch (eventType) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED": {
        const parsed = parseExternalReference(payment.externalReference);
        if (!parsed) {
          console.warn("[asaas-webhook] pagamento sem externalReference reconhecível:", payment.id);
          break;
        }
        const plan = await findPlanByTier(parsed.tier);
        const validUntil = new Date(Date.now() + (plan?.durationDays ?? 30) * 86_400_000);

        const outcome = await withWebhookIdempotency("asaas", `${eventType}:${payment.id}`, async (tx) => {
          await tx.subscription.updateMany({
            where: { tenantId: parsed.tenantId },
            data: {
              tier: parsed.tier,
              status: "ATIVA",
              trialEndsAt: null,
              currentPeriodEnd: validUntil,
              ...(typeof payment.subscription === "string" ? { externalId: payment.subscription } : {}),
            },
          });
          if (!plan) {
            return { shouldEmail: true, receiptId: null as string | null };
          }
          const amountCents = Math.round(
            (typeof payment.value === "number" ? payment.value : plan.priceCentsTotal / 100) * 100
          );
          const receipt = await tx.paymentReceipt.create({
            data: {
              tenantId: parsed.tenantId,
              gateway: "asaas",
              externalPaymentId: String(payment.id),
              planTier: parsed.tier,
              planName: plan.name,
              amountCents,
              paidAt: new Date(),
            },
          });
          return { shouldEmail: true, receiptId: receipt.id as string | null };
        });

        if (outcome.processed && outcome.result.shouldEmail) {
          const admin = await prisma.membership.findFirst({
            where: { tenantId: parsed.tenantId, role: "ADMIN" },
            include: { user: true },
          });
          if (admin?.user.email) {
            const attachments = outcome.result.receiptId
              ? await renderReceiptPdf(outcome.result.receiptId)
                  .then((r) => [{ filename: "comprovante-pagamento.pdf", content: r.buffer }])
                  .catch((err) => {
                    console.error("[asaas-webhook] falha ao gerar PDF do comprovante pro e-mail:", err);
                    return undefined;
                  })
              : undefined;
            await sendEmail({
              to: admin.user.email,
              ...paymentReceivedEmail({ planName: plan?.name ?? parsed.tier, validUntil }),
              attachments,
            });
          }
        }
        break;
      }

      case "PAYMENT_OVERDUE": {
        const parsed = parseExternalReference(payment.externalReference);
        if (!parsed) break;
        await withWebhookIdempotency("asaas", `${eventType}:${payment.id}`, async (tx) => {
          await tx.subscription.updateMany({
            where: { tenantId: parsed.tenantId, status: "ATIVA", tier: { not: "TESTE_GRATIS" } },
            data: { status: "INADIMPLENTE" },
          });
        });
        break;
      }

      default:
        // Evento que não nos interessa (PAYMENT_CREATED, estornos, etc.):
        // 200 e segue — a fila do Asaas não pode ser travada por isso.
        break;
    }
  } catch (err) {
    // Erro NOSSO (banco fora, etc.): aqui sim vale 500 — o Asaas vai
    // reentregar o evento, e como o carimbo de idempotência roda na mesma
    // transação da mutação, reprocessar é seguro (não fica "meio
    // processado").
    console.error("[asaas-webhook] erro ao processar evento:", eventType, err);
    return NextResponse.json({ success: false, error: "Erro interno." }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { received: true } });
}
