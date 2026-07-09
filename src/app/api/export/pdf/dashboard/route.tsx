import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { withTenant } from "@/lib/with-tenant";
import { forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getDashboardReport } from "@/repositories/dashboard-report.repository";
import { DashboardReportDocument } from "@/components/pdf/DashboardReportDocument";

/**
 * GET /api/export/pdf/dashboard
 *
 * Relatório consolidado do tenant inteiro (médias por turma/disciplina,
 * evolução por período, pontos de atenção) — mesmo RBAC e escopo de tenant
 * das outras rotas de export. Sem geração antecipada: renderiza na hora.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

/** Extraído do handler pra ser reaproveitado por `GET /api/export/download/[token]` (link assinado de WhatsApp) — mesmo arquivo, sem duplicar a lógica de renderização. */
export async function buildDashboardPdfBuffer(tenantId: string): Promise<Buffer> {
  const report = await getDashboardReport(tenantId);
  return renderToBuffer(<DashboardReportDocument data={report} />);
}

export const GET = withTenant(async (_request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para exportar o relatório do dashboard.");
  }

  const buffer = await buildDashboardPdfBuffer(user.tenantId);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="relatorio-dashboard.pdf"`,
    },
  });
});
