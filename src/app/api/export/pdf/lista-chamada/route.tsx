import { NextResponse } from "next/server";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/with-tenant";
import { getMonthlyAttendanceReport } from "@/services/attendance.service";
import { AttendanceSheetDocument } from "@/components/pdf/AttendanceSheetDocument";
import { badRequest } from "@/lib/http/errors";

/**
 * GET /api/export/pdf/lista-chamada?classSubjectId=...&month=YYYY-MM
 *
 * Export "papel" da lista de chamada (Etapa 11) — mesma checagem de
 * tenant/professor de `getAttendanceSheet`, reaproveitada dentro do service.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const querySchema = z.object({
  classSubjectId: z.string().min(1),
  month: z.string().min(1),
});

export const GET = withTenant(async (request, user) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    classSubjectId: searchParams.get("classSubjectId"),
    month: searchParams.get("month"),
  });
  if (!parsed.success) {
    throw badRequest("classSubjectId e month (YYYY-MM) são obrigatórios.");
  }

  const report = await getMonthlyAttendanceReport({
    tenantId: user.tenantId,
    role: user.role,
    membershipId: user.id,
    classSubjectId: parsed.data.classSubjectId,
    month: parsed.data.month,
  });

  const schoolName = (await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } }))?.name ?? "";

  const buffer = await renderToBuffer(<AttendanceSheetDocument data={report} schoolName={schoolName} />);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="lista-chamada-${report.subjectName.toLowerCase().replace(/\s+/g, "-")}.pdf"`,
    },
  });
});
