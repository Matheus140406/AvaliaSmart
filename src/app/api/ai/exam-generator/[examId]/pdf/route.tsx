import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/with-tenant";
import { notFound, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getGeneratedExam } from "@/services/ai/exam-generator.service";
import { ExamDocument } from "@/components/pdf/ExamDocument";

type RouteContext = { params: Promise<{ examId: string }> };

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/ai/exam-generator/[examId]/pdf — baixa a prova já gerada em PDF,
 * sob demanda (nunca pré-gerado). Reaproveita @react-pdf/renderer (mesma lib
 * do boletim/resumo/dashboard). Tenant-scoped via `getGeneratedExam`.
 */
export const GET = withTenant<RouteContext>(async (_request: NextRequest, user, context) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para exportar provas.");
  }

  const { examId } = await context.params;
  const exam = await getGeneratedExam(user.tenantId, examId);

  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } });
  if (!tenant) throw notFound("Workspace não encontrado.");

  const buffer = await renderToBuffer(
    <ExamDocument data={{ tenantName: tenant.name, exam: exam.content, generatedAt: exam.createdAt }} />
  );

  const safeName = exam.title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="prova-${safeName}.pdf"`,
    },
  });
});
