import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, notFound, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { findEvaluationTypeById } from "@/repositories/evaluation-type.repository";

/**
 * POST /api/avaliacoes — cria uma "avaliação" (uma ou mais linhas de
 * `GradeConfig`, uma por critério de correção). Não existia NENHUM jeito de
 * criar `GradeConfig` pela UI até agora (só via seed) — esta rota é o
 * backend real do stepper "Nova Avaliação" do handoff de design.
 *
 * Um critério = um `GradeConfig` — quando o professor lista mais de uma
 * competência com peso próprio ("Leitura 40%, Escrita 60%"), isso vira duas
 * linhas de GradeConfig com o mesmo classSubject/term/tipo/data/nota máxima/
 * recuperação, só o nome e o peso mudando por critério. Com um único
 * critério, o nome do `GradeConfig` é só o título da avaliação.
 */
const criterionSchema = z.object({
  name: z.string().trim().min(1, "Nome do critério é obrigatório."),
  weight: z.number().positive("Peso deve ser maior que zero."),
});

const bodySchema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  termId: z.string().min(1),
  title: z.string().trim().min(1, "Informe o título da avaliação."),
  typeId: z.string().min(1, "Selecione o tipo de avaliação."),
  criteria: z.array(criterionSchema).min(1, "Adicione pelo menos um critério."),
  scheduledDate: z.string().datetime().nullable().optional(),
  maxScore: z.number().positive().default(10),
  hasRecovery: z.boolean().default(false),
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para criar avaliações.");
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }
  const { classId, subjectId, termId, title, typeId, criteria, scheduledDate, maxScore, hasRecovery } = parsed.data;

  const klass = await prisma.class.findUnique({ where: { id: classId } });
  if (!klass || klass.tenantId !== user.tenantId) {
    throw notFound("Turma não encontrada.");
  }

  const classSubject = await prisma.classSubject.findFirst({ where: { classId, subjectId } });
  if (!classSubject) {
    throw notFound("Essa disciplina não está vinculada a essa turma.");
  }
  if (user.role === "PROFESSOR" && classSubject.teacherId !== user.id) {
    throw forbidden("Você não leciona essa disciplina/turma.");
  }

  const term = await prisma.term.findUnique({ where: { id: termId } });
  if (!term || term.academicYearId !== klass.academicYearId) {
    throw notFound("Período letivo não encontrado para esta turma.");
  }

  const evaluationType = await findEvaluationTypeById(typeId);
  if (!evaluationType || evaluationType.tenantId !== user.tenantId) {
    throw notFound("Tipo de avaliação não encontrado.");
  }

  const created = await prisma.$transaction((tx) =>
    Promise.all(
      criteria.map((criterion, index) =>
        tx.gradeConfig.create({
          data: {
            classSubjectId: classSubject.id,
            termId,
            name: criteria.length > 1 ? `${title} — ${criterion.name}` : title,
            typeId,
            weight: criterion.weight,
            maxScore,
            order: index,
            scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
            hasRecovery,
          },
        })
      )
    )
  );

  return apiSuccess(
    {
      classId,
      title,
      items: created.map((gc) => ({ id: gc.id, name: gc.name, weight: Number(gc.weight) })),
    },
    201
  );
});
