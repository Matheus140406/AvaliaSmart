import { NextResponse } from "next/server";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/with-tenant";
import { computeWeightedAverage, classifyAverage, computeFinalAverage } from "@/lib/grades/calculations";
import { BoletimDocument, type BoletimData } from "@/components/pdf/BoletimDocument";
import { badRequest, notFound, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import type { GradeConfigDTO } from "@/types/grade-grid";

/**
 * GET /api/export/pdf/boletim?enrollmentId=...
 *
 * Node.js runtime — @react-pdf/renderer roda puro em Node (sem binário de
 * browser), então não há o mesmo problema de Edge que as outras rotas têm
 * com o Prisma; mas como esta rota TAMBÉM usa Prisma pra buscar os dados,
 * fica no mesmo runtime de qualquer forma.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const querySchema = z.object({ enrollmentId: z.string().min(1) });

/** Extraído do handler pra ser reaproveitado por `GET /api/export/download/[token]` (link assinado de WhatsApp) — mesma lógica, sem duplicar. Lança `notFound` se a matrícula não pertencer ao tenant (mesma checagem de sempre, só que chamada explicitamente aqui em vez de vir de `withTenant`). */
export async function buildBoletimPdfBuffer(tenantId: string, enrollmentId: string): Promise<{ buffer: Buffer; studentName: string }> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { student: true, class: { include: { academicYear: true } } },
  });
  if (!enrollment || enrollment.class.tenantId !== tenantId) {
    throw notFound("Matrícula não encontrada.");
  }

  const [tenant, classSubjects, terms] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.classSubject.findMany({
      where: { classId: enrollment.classId },
      include: { subject: true },
      orderBy: { subject: { name: "asc" } },
    }),
    prisma.term.findMany({
      where: { academicYearId: enrollment.class.academicYearId },
      orderBy: { order: "asc" },
    }),
  ]);

  const classSubjectIds = classSubjects.map((cs) => cs.id);
  const termIds = terms.map((t) => t.id);

  const [gradeConfigs, grades, attendances] = await Promise.all([
    prisma.gradeConfig.findMany({
      where: { classSubjectId: { in: classSubjectIds }, termId: { in: termIds } },
      include: { type: true },
    }),
    prisma.grade.findMany({ where: { enrollmentId, termId: { in: termIds } } }),
    prisma.attendance.findMany({ where: { enrollmentId, classSubjectId: { in: classSubjectIds } } }),
  ]);

  const gradeValueByConfigId = new Map(
    grades.map((g) => [g.gradeConfigId, g.value !== null ? Number(g.value) : null])
  );

  const subjects = classSubjects.map((cs) => {
    const termAverages = terms.map((term) => {
      const configsHere: GradeConfigDTO[] = gradeConfigs
        .filter((gc) => gc.classSubjectId === cs.id && gc.termId === term.id)
        .map((gc) => ({
          id: gc.id,
          name: gc.name,
          typeId: gc.typeId,
          typeName: gc.type.name,
          weight: Number(gc.weight),
          maxScore: Number(gc.maxScore),
          order: gc.order,
        }));

      const { average, filled, total } = computeWeightedAverage(configsHere, (id) => gradeValueByConfigId.get(id) ?? null);
      return { termId: term.id, termName: term.name, average, filled, total };
    });

    // Média final = média aritmética das médias bimestrais/trimestrais já
    // fechadas — o padrão mais comum de boletim brasileiro (ver
    // computeFinalAverage em lib/grades/calculations.ts, compartilhada com a
    // Ata de Resultados Finais pra nunca divergir).
    const finalAverage = computeFinalAverage(termAverages);
    const filledAverages = termAverages.filter((t) => t.average !== null);

    const subjectAttendances = attendances.filter((a) => a.classSubjectId === cs.id);
    const attendancePct =
      subjectAttendances.length > 0
        ? (subjectAttendances.filter((a) => a.present || a.justified).length / subjectAttendances.length) * 100
        : 100;

    return {
      subjectName: cs.subject.name,
      termAverages,
      finalAverage,
      finalStatus: classifyAverage(finalAverage, filledAverages.length),
      attendancePct,
    };
  });

  const data: BoletimData = {
    schoolName: tenant?.name ?? "",
    studentName: enrollment.student.name,
    registrationCode: enrollment.student.registrationCode,
    className: enrollment.class.name,
    academicYear: enrollment.class.academicYear.year,
    terms: terms.map((t) => ({ id: t.id, name: t.name })),
    subjects,
  };

  const buffer = await renderToBuffer(<BoletimDocument data={data} />);
  return { buffer, studentName: enrollment.student.name };
}

export const GET = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permiss\u00e3o para gerar boletins.");
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ enrollmentId: searchParams.get("enrollmentId") });
  if (!parsed.success) {
    throw badRequest("enrollmentId \u00e9 obrigat\u00f3rio.");
  }

  const { buffer, studentName } = await buildBoletimPdfBuffer(user.tenantId, parsed.data.enrollmentId);
  const safeFileName = studentName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-").toLowerCase();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="boletim-${safeFileName}.pdf"`,
    },
  });
});
