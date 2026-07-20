import { NextResponse, type NextRequest } from "next/server";
import { HttpError, badRequest } from "@/lib/http/errors";
import { apiError } from "@/lib/http/api-response";
import { redeemExportShareLink } from "@/services/export/share-link.service";
import { buildDashboardPdfBuffer } from "@/app/api/export/pdf/dashboard/route";
import { buildDashboardExcelBuffer } from "@/app/api/export/excel/dashboard/route";
import { buildBoletimPdfBuffer } from "@/app/api/export/pdf/boletim/route";
import { renderReceiptPdf } from "@/services/billing/receipt.service";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = { params: Promise<{ token: string }> };

/**
 * GET /api/export/download/[token] — PÚBLICA de propósito (sem
 * `withTenant`/cookie de sessão): o token da URL É a autenticação, gerado
 * por `POST /api/export/share-link` só depois que um usuário autenticado
 * pediu o compartilhamento. É o link que abre o wa.me pro professor
 * compartilhar um export que ele mesmo já tinha permissão de gerar —
 * nunca dá acesso a nada que o link em si não carregue.
 */
export const GET = async (_request: NextRequest, context: RouteContext): Promise<NextResponse> => {
  try {
    const { token } = await context.params;
    const link = await redeemExportShareLink(token);

    switch (link.kind) {
      case "dashboard-pdf": {
        const buffer = await buildDashboardPdfBuffer(link.tenantId);
        return new NextResponse(new Uint8Array(buffer), {
          headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="relatorio-dashboard.pdf"` },
        });
      }
      case "dashboard-excel": {
        const { buffer, tenantName } = await buildDashboardExcelBuffer(link.tenantId);
        const safeName = tenantName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").toLowerCase();
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="dashboard-${safeName}.xlsx"`,
          },
        });
      }
      case "boletim-pdf":
      case "boletim-portal": {
        const enrollmentId = link.params.enrollmentId;
        if (!enrollmentId) throw badRequest("Link de boletim sem enrollmentId.");
        const { buffer, studentName } = await buildBoletimPdfBuffer(link.tenantId, enrollmentId);
        const safeFileName = studentName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").toLowerCase();
        return new NextResponse(new Uint8Array(buffer), {
          headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="boletim-${safeFileName}.pdf"` },
        });
      }
      case "receipt-pdf": {
        const receiptId = link.params.receiptId;
        if (!receiptId) throw badRequest("Link de comprovante sem receiptId.");
        const { buffer } = await renderReceiptPdf(receiptId, link.tenantId);
        return new NextResponse(new Uint8Array(buffer), {
          headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="comprovante-${receiptId}.pdf"` },
        });
      }
    }
  } catch (err) {
    if (err instanceof HttpError) {
      return apiError(err.message, err.status, err.details);
    }
    // eslint-disable-next-line no-console
    console.error("[unhandled] GET /api/export/download/[token]:", err);
    return apiError("Erro interno. Tente novamente em instantes.", 500);
  }
};
