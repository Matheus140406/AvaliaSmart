import { NextResponse } from "next/server";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/with-tenant";
import { badRequest, notFound, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { requireAiAccess } from "@/services/ai/guard";
import { getPerformanceSummary } from "@/services/ai/performance-summary.service";
import { assertClassInTenant, assertStudentInTenant } from "@/repositories/performance.repository";
import { AiSummaryDocument } from "@/components/pdf/AiSummaryDocument";

/**
 * GET /api/export/pdf/ai-summary?classId=|studentId=&termId=
 *
 * Formata o resumo de desempenho (já existente, Etapa 1 de IA) em PDF —
 * reusa @react-pdf/renderer (mesma lib do boletim), sem gerar o PDF de
 * antemão: renderiza sob demanda a cada request.
 */

const querySchema = z
  .object({
    classId: z.string().min(1).optional(),
    studentId: z.string().min(1).optional(),
    termId: z.string().min(1),
  })
  .refine((v) => Boolean(v.classId) !== Boolean(v.studentId), {
    message: "Informe classId OU studentId (exatamente um dos dois).",
  });

export const runtime = "nodejs";
export const maxDuration = 30;

export const GET = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para exportar resumos de desempenho.");
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    classId: searchParams.get("classId") ?? undefined,
    studentId: searchParams.get("studentId") ?? undefined,
    termId: searchParams.get("termId"),
  });
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Parâmetros inválidos.");
  }
  const { classId, studentId, termId } = parsed.data;

  const accessBlock = await requireAiAccess(user.tenantId);
  if (accessBlock) return accessBlock;

  const [tenant, term] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } }),
    prisma.term.findUnique({ where: { id: termId } }),
  ]);
  if (!tenant) throw notFound("Workspace não encontrado.");

  let scopeLabel: string;
  let scopeName: string;
  if (classId) {
    const classRecord = await assertClassInTenant(user.tenantId, classId);
    if (!classRecord || !term || term.academicYearId !== classRecord.academicYearId) {
      throw notFound("Turma ou período não encontrado.");
    }
    scopeLabel = "Turma";
    scopeName = classRecord.name;
  } else {
    const student = await assertStudentInTenant(user.tenantId, studentId as string);
    if (!student) throw notFound("Aluno não encontrado.");
    scopeLabel = "Aluno";
    scopeName = student.name;
  }

  const { summary } = await getPerformanceSummary({
    tenantId: user.tenantId,
    membershipId: user.id,
    scopeType: classId ? "CLASS" : "STUDENT",
    scopeId: (classId ?? studentId) as string,
    termId,
  });

  const buffer = await renderToBuffer(
    <AiSummaryDocument
      data={{
        tenantName: tenant.name,
        scopeLabel,
        scopeName,
        termName: term?.name ?? "",
        generatedAt: new Date(),
        summary,
      }}
    />
  );

  const safeName = scopeName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="resumo-ia-${safeName}.pdf"`,
    },
  });
});
