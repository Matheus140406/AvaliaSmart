import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { PaymentReceiptDocument } from "@/components/pdf/PaymentReceiptDocument";
import { notFound } from "@/lib/http/errors";

/**
 * Comprovante de pagamento (Etapa A3). O PDF NUNCA fica pré-gerado — só os
 * dados estruturados (`PaymentReceipt`) são persistidos; o PDF é renderizado
 * sob demanda, tanto no download quanto no e-mail automático do webhook.
 *
 * A criação do `PaymentReceipt` em si acontece INLINE dentro da transação
 * de idempotência de cada webhook (lib/billing/webhook-idempotency.ts),
 * não aqui — precisa do mesmo client `tx` que atualiza a Subscription, pra
 * as duas escritas serem atômicas. Este módulo só cuida de renderizar e
 * listar o que já foi criado.
 */

export async function renderReceiptPdf(receiptId: string, tenantId?: string): Promise<{ buffer: Buffer; tenantName: string }> {
  const receipt = await prisma.paymentReceipt.findUnique({
    where: { id: receiptId },
    include: { tenant: { select: { name: true } } },
  });
  if (!receipt || (tenantId && receipt.tenantId !== tenantId)) {
    throw notFound("Comprovante não encontrado.");
  }

  const buffer = await renderToBuffer(
    <PaymentReceiptDocument
      data={{
        tenantName: receipt.tenant.name,
        gateway: receipt.gateway,
        externalPaymentId: receipt.externalPaymentId,
        planName: receipt.planName,
        amountCents: receipt.amountCents,
        paidAt: receipt.paidAt,
        receiptId: receipt.id,
      }}
    />
  );
  return { buffer: Buffer.from(buffer), tenantName: receipt.tenant.name };
}

export function listReceiptsForTenant(tenantId: string) {
  return prisma.paymentReceipt.findMany({
    where: { tenantId },
    orderBy: { paidAt: "desc" },
  });
}
