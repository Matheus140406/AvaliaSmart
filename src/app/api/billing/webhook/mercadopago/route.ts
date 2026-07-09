import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findPlanByTier } from "@/repositories/plan.repository";
import { parseExternalReference } from "@/lib/billing/external-reference";
import { withWebhookIdempotency } from "@/lib/billing/webhook-idempotency";
import { fetchMercadoPagoPayment, verifyMercadoPagoSignature } from "@/lib/billing/mercadopago";
import { sendEmail, paymentReceivedEmail } from "@/lib/email/resend";
import { renderReceiptPdf } from "@/services/billing/receipt.service";

/**
 * POST /api/billing/webhook/mercadopago
 *
 * Diferenças-chave em relação ao webhook do Asaas (mesmo arquivo irmão em
 * ../webhook/route.ts):
 *
 * 1. O aviso vem ENXUTO: `{ type, data: { id } }`. O `data.id` também
 *    aparece na query string (`?data.id=...&type=payment`). Não tem status
 *    de pagamento no corpo — é preciso um GET em /v1/payments/{id} pra saber
 *    se foi aprovado.
 * 2. Autenticidade é HMAC (header `x-signature` + `x-request-id`), não um
 *    token simples — ver o comentário detalhado em lib/billing/mercadopago.ts
 *    sobre o ponto mais frágil dessa validação.
 * 3. Rota PÚBLICA (o MP chama de fora) — igual ao webhook do Asaas.
 * 4. Idempotente via `withWebhookIdempotency` (gateway="mercadopago",
 *    eventId="payment:{id}") — o MP reentrega webhook em caso de
 *    timeout/erro 5xx nosso, então o mesmo pagamento aprovado pode chegar
 *    2+ vezes.
 */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id") ?? "";
  const topic = url.searchParams.get("type");

  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (secret) {
    const valid = verifyMercadoPagoSignature({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId,
      secret,
    });
    if (!valid) {
      return NextResponse.json({ success: false, error: "Assinatura inválida." }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[mp-webhook] MERCADOPAGO_WEBHOOK_SECRET não configurado em produção — evento recusado.");
    return NextResponse.json({ success: false, error: "Webhook não configurado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const effectiveTopic = topic ?? body?.type;
  const effectiveId = dataId || body?.data?.id;

  if (!effectiveTopic || !effectiveId) {
    return NextResponse.json({ success: true, data: { ignored: true } }); // 200: payload estranho não pode travar a fila
  }

  try {
    if (effectiveTopic === "payment") {
      const payment = await fetchMercadoPagoPayment(effectiveId);
      const parsed = parseExternalReference(payment.external_reference);

      if (!parsed) {
        console.warn("[mp-webhook] pagamento sem external_reference reconhecível:", effectiveId);
        return NextResponse.json({ success: true, data: { received: true } });
      }

      const plan = payment.status === "approved" ? await findPlanByTier(parsed.tier) : null;
      const validUntil = plan ? new Date(Date.now() + plan.durationDays * 86_400_000) : null;

      const outcome = await withWebhookIdempotency("mercadopago", `payment:${effectiveId}`, async (tx) => {
        if (payment.status === "approved" && validUntil && plan) {
          await tx.subscription.updateMany({
            where: { tenantId: parsed.tenantId },
            data: { tier: parsed.tier, status: "ATIVA", trialEndsAt: null, currentPeriodEnd: validUntil },
          });
          const amountCents = Math.round(
            (typeof payment.transaction_amount === "number" ? payment.transaction_amount : plan.priceCentsTotal / 100) * 100
          );
          const receipt = await tx.paymentReceipt.create({
            data: {
              tenantId: parsed.tenantId,
              gateway: "mercadopago",
              externalPaymentId: String(effectiveId),
              planTier: parsed.tier,
              planName: plan.name,
              amountCents,
              paidAt: new Date(),
            },
          });
          return { shouldEmail: true, receiptId: receipt.id as string | null };
        }
        if (payment.status === "rejected" || payment.status === "cancelled") {
          await tx.subscription.updateMany({
            where: { tenantId: parsed.tenantId, status: "ATIVA", tier: { not: "TESTE_GRATIS" } },
            data: { status: "INADIMPLENTE" },
          });
        }
        return { shouldEmail: false, receiptId: null as string | null };
      });

      if (outcome.processed && outcome.result.shouldEmail && validUntil) {
        const admin = await prisma.membership.findFirst({
          where: { tenantId: parsed.tenantId, role: "ADMIN" },
          include: { user: true },
        });
        if (admin?.user.email) {
          const attachments = outcome.result.receiptId
            ? await renderReceiptPdf(outcome.result.receiptId)
                .then((r) => [{ filename: "comprovante-pagamento.pdf", content: r.buffer }])
                .catch((err) => {
                  console.error("[mp-webhook] falha ao gerar PDF do comprovante pro e-mail:", err);
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
      // outros status (pending, in_process, etc.): nada a fazer ainda, só aguardar próximo evento.
    }
    // subscription_preapproval / subscription_authorized_payment: sem ação
    // própria hoje — o sinal de verdade que usamos é sempre o pagamento.
  } catch (err) {
    console.error("[mp-webhook] erro ao processar evento:", effectiveTopic, effectiveId, err);
    return NextResponse.json({ success: false, error: "Erro interno." }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { received: true } });
}
