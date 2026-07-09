import { NextRequest, NextResponse } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { forbidden } from "@/lib/http/errors";
import { renderReceiptPdf } from "@/services/billing/receipt.service";

type RouteContext = { params: Promise<{ receiptId: string }> };

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/billing/receipts/[receiptId]/pdf — baixa o PDF de um comprovante
 * já emitido (ADMIN). Gerado sob demanda a cada request — nenhum PDF fica
 * armazenado. `renderReceiptPdf` recebe o tenantId do usuário logado e
 * confere que o comprovante pertence a ele antes de renderizar (404 caso
 * contrário, nunca vaza dado de outro tenant).
 */
export const GET = withTenant<RouteContext>(async (_request: NextRequest, user, context) => {
  if (user.role !== "ADMIN") {
    throw forbidden("Só administradores podem baixar comprovantes de pagamento.");
  }
  const { receiptId } = await context.params;
  const { buffer } = await renderReceiptPdf(receiptId, user.tenantId);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="comprovante-${receiptId}.pdf"`,
    },
  });
});
