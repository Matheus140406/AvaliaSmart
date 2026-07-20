import { NextResponse } from "next/server";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/with-tenant";
import { computeWeightedAverage, classifyAverage } from "@/lib/grades/calculations";
import { MapaNotasDocument, type MapaNotasData } from "@/components/pdf/MapaNotasDocument";
import { badRequest, notFound, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import type { GradeConfigDTO } from "@/types/grade-grid";

/**
 * GET /api/export/pdf/mapa-notas?classSubjectId=...&termId=...
 *
 * Export "papel" da GradeGrid — mesmos gradeConfigs/notas/regra de média
 * ponderada que a tela mostra em tempo real (computeWeightedAverage), só
 * renderizado como tabela pra imprimir/arquivar.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const querySchema = z.object({
  classSubjectId: z.string().min(1),
  termId: z.string().min(1),
});

export const GET = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para gerar o Mapa de Notas.");
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    classSubjectId: searchParams.get("classSubjectId"),
    termId: searchParams.get("termId"),
  });
  if (!parsed.success) {
    throw badRequest("classSubjectId e termId são obrigatórios.");
  }
  const { classSubjectId, termId } = parsed.data;

  const classSubject = await prisma.classSubject.findUnique({
    where: { id: classSubjectId },
    include: { class: true, subject: true },
  });
  if (!classSubject || classSubject.class.tenantId !== user.tenantId) {
    throw notFound("Disciplina da turma não encontrada.");
  }

  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term || term.academicYearId !== classSubject.class.academicYearId) {
    throw notFound("Período não encontrado para esta turma.");
  }

  const [gradeConfigsRaw, enrollments] = await Promise.all([
    prisma.gradeConfig.findMany({
      where: { classSubjectId, termId },
      include: { type: true },
      orderBy: { order: "asc" },
    }),
    prisma.enrollment.findMany({
      where: { classId: classSubject.classId, status: "ATIVA" },
      include: { student: true, grades: { where: { termId } } },
      orderBy: { student: { name: "asc" } },
    }),
  ]);

  const gradeConfigs: GradeConfigDTO[] = gradeConfigsRaw.map((gc) => ({
    id: gc.id,
    name: gc.name,
    typeId: gc.typeId,
    typeName: gc.type.name,
    weight: Number(gc.weight),
    maxScore: Number(gc.maxScore),
    order: gc.order,
  }));

  const students = enrollments.map((enrollment) => {
    const valuesByConfig = new Map(
      enrollment.grades.map((g) => [g.gradeConfigId, g.value !== null ? Number(g.value) : null])
    );
    const values = gradeConfigs.map((gc) => valuesByConfig.get(gc.id) ?? null);
    const { average, filled } = computeWeightedAverage(gradeConfigs, (id) => valuesByConfig.get(id) ?? null);

    return {
      studentName: enrollment.student.name,
      registrationCode: enrollment.student.registrationCode,
      values,
      average,
      status: classifyAverage(average, filled),
    };
  });

  const data: MapaNotasData = {
    schoolName: (await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } }))?.name ?? "",
    className: classSubject.class.name,
    subjectName: classSubject.subject.name,
    termName: term.name,
    assessments: gradeConfigs.map((gc) => ({ name: gc.name, maxScore: gc.maxScore })),
    students,
  };

  const buffer = await renderToBuffer(<MapaNotasDocument data={data} />);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="mapa-notas-${classSubject.subject.name.toLowerCase().replace(/\s+/g, "-")}.pdf"`,
    },
  });
});
