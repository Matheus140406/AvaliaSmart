import { NextResponse } from "next/server";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/with-tenant";
import {
  computeWeightedAverage,
  classifyAverage,
  computeFinalAverage,
  consolidateFinalStatus,
} from "@/lib/grades/calculations";
import { AtaResultadosDocument, type AtaResultadosData } from "@/components/pdf/AtaResultadosDocument";
import { badRequest, notFound, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import type { GradeConfigDTO } from "@/types/grade-grid";

/**
 * GET /api/export/pdf/ata-resultados?classId=...
 *
 * Mesma matemática do boletim (route.tsx vizinho), mas pra TODOS os alunos
 * da turma de uma vez — uma linha por aluno, situação final consolidada
 * (aprovado só se aprovado em TODAS as disciplinas; reprovado se reprovado
 * em qualquer uma; senão recuperação).
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const querySchema = z.object({ classId: z.string().min(1) });

export const GET = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para gerar a Ata de Resultados Finais.");
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ classId: searchParams.get("classId") });
  if (!parsed.success) {
    throw badRequest("classId é obrigatório.");
  }
  const { classId } = parsed.data;

  const klass = await prisma.class.findUnique({ where: { id: classId }, include: { academicYear: true } });
  if (!klass || klass.tenantId !== user.tenantId) {
    throw notFound("Turma não encontrada.");
  }

  const [tenant, classSubjects, terms, enrollments] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } }),
    prisma.classSubject.findMany({ where: { classId }, include: { subject: true }, orderBy: { subject: { name: "asc" } } }),
    prisma.term.findMany({ where: { academicYearId: klass.academicYearId }, orderBy: { order: "asc" } }),
    prisma.enrollment.findMany({
      where: { classId, status: "ATIVA" },
      include: { student: true },
      orderBy: { student: { name: "asc" } },
    }),
  ]);

  const classSubjectIds = classSubjects.map((cs) => cs.id);
  const termIds = terms.map((t) => t.id);
  const enrollmentIds = enrollments.map((e) => e.id);

  const [gradeConfigs, grades] = await Promise.all([
    prisma.gradeConfig.findMany({
      where: { classSubjectId: { in: classSubjectIds }, termId: { in: termIds } },
      include: { type: true },
    }),
    prisma.grade.findMany({ where: { enrollmentId: { in: enrollmentIds }, termId: { in: termIds } } }),
  ]);

  const gradesByEnrollment = new Map<string, Map<string, number | null>>();
  for (const g of grades) {
    if (!gradesByEnrollment.has(g.enrollmentId)) gradesByEnrollment.set(g.enrollmentId, new Map());
    gradesByEnrollment.get(g.enrollmentId)!.set(g.gradeConfigId, g.value !== null ? Number(g.value) : null);
  }

  const students = enrollments.map((enrollment) => {
    const gradeValueByConfigId = gradesByEnrollment.get(enrollment.id) ?? new Map<string, number | null>();

    const subjectResults = classSubjects.map((cs) => {
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
        const { average } = computeWeightedAverage(configsHere, (id) => gradeValueByConfigId.get(id) ?? null);
        return { average };
      });

      const average = computeFinalAverage(termAverages);
      const filled = termAverages.filter((t) => t.average !== null).length;
      return { average, status: classifyAverage(average, filled) };
    });

    return {
      studentName: enrollment.student.name,
      registrationCode: enrollment.student.registrationCode,
      subjects: subjectResults,
      finalStatus: consolidateFinalStatus(subjectResults.map((s) => s.status)),
    };
  });

  const data: AtaResultadosData = {
    schoolName: tenant?.name ?? "",
    className: klass.name,
    academicYear: klass.academicYear.year,
    subjectNames: classSubjects.map((cs) => cs.subject.name),
    students,
  };

  const buffer = await renderToBuffer(<AtaResultadosDocument data={data} />);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ata-resultados-${klass.name.toLowerCase().replace(/\s+/g, "-")}.pdf"`,
    },
  });
});
