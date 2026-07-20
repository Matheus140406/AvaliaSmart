import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, conflict, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";

/**
 * GET /api/turmas — lista as turmas do ano letivo ativo do tenant, com
 * contagem de alunos e disciplinas vinculadas (pra decidir, na tela, se
 * navega direto pra `/turmas/[classId]/notas/[subjectId]` ou mostra um
 * sub-seletor de disciplina). Mesmo RBAC das outras telas do professor
 * (`WRITE_ROLES`) — não existia rota nenhuma de listagem até agora, só a
 * página aninhada que já exige saber o `classId`/`subjectId` de antemão.
 */
export const GET = withTenant(async (_request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para ver as turmas.");
  }

  const academicYear = await prisma.academicYear.findFirst({
    where: { tenantId: user.tenantId, isActive: true },
  });
  if (!academicYear) {
    return apiSuccess({ classes: [], academicYear: null, terms: [] });
  }

  const [classes, terms] = await Promise.all([
    prisma.class.findMany({
      where: { tenantId: user.tenantId, academicYearId: academicYear.id },
      include: {
        classSubjects: { include: { subject: true }, orderBy: { subject: { name: "asc" } } },
        enrollments: { where: { status: "ATIVA" }, select: { id: true } },
      },
      orderBy: { name: "asc" },
    }),
    // Períodos (bimestres) do ano letivo ativo — usado pelo seletor
    // "Bimestre" do stepper de Nova Avaliação; não tinha consumidor até agora.
    prisma.term.findMany({ where: { academicYearId: academicYear.id }, orderBy: { order: "asc" } }),
  ]);

  return apiSuccess({
    academicYear: { id: academicYear.id, year: academicYear.year },
    terms: terms.map((t) => ({ id: t.id, name: t.name, order: t.order })),
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      gradeLevel: c.gradeLevel,
      shift: c.shift,
      studentCount: c.enrollments.length,
      // `id` continua sendo Subject.id (usado na rota /turmas/[classId]/notas/[subjectId],
      // que resolve o ClassSubject a partir de classId+subjectId). `classSubjectId`
      // é novo aqui — o seletor de contexto do import (`ImportContextPicker`)
      // precisa do ClassSubject.id direto, que a rota de import já exige.
      subjects: c.classSubjects.map((cs) => ({
        id: cs.subjectId,
        classSubjectId: cs.id,
        name: cs.subject.name,
      })),
    })),
  });
});

const createClassSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da turma."),
  gradeLevel: z.string().trim().min(1).optional(),
  shift: z.string().trim().min(1).optional(),
  // Nomes de disciplina, não IDs — o professor digita livremente; disciplinas
  // já existentes no tenant (mesmo nome, case-insensitive) são reaproveitadas
  // via ClassSubject, as demais são criadas na hora. Evita exigir uma tela
  // separada de "gerenciar disciplinas" só pra cadastrar uma turma.
  subjectNames: z.array(z.string().trim().min(1)).max(20).default([]),
});

/**
 * POST /api/turmas — cria a turma no ano letivo ATIVO do tenant (não existe
 * hoje seletor de ano letivo na tela porque cada tenant só tem um
 * AcademicYear ativo por vez — ver `@@unique([tenantId, year])` +
 * `isActive` em schema.prisma; se um tenant vier a ter múltiplos anos
 * letivos simultâneos no futuro, este é o ponto a estender). Disciplinas
 * (`ClassSubject`) são criadas junto, na mesma transação — sem elas a turma
 * fica sem lugar nenhum pra lançar nota (nenhuma tela de "adicionar
 * disciplina depois" existe hoje).
 */
export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para criar turmas.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createClassSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }
  const { name, gradeLevel, shift, subjectNames } = parsed.data;

  const academicYear = await prisma.academicYear.findFirst({
    where: { tenantId: user.tenantId, isActive: true },
  });
  if (!academicYear) {
    throw conflict("Nenhum ano letivo ativo encontrado para este workspace.");
  }

  const uniqueSubjectNames = [...new Set(subjectNames.map((s) => s.trim()).filter(Boolean))];

  const created = await prisma.$transaction(async (tx) => {
    const klass = await tx.class.create({
      data: {
        tenantId: user.tenantId,
        academicYearId: academicYear.id,
        name,
        gradeLevel: gradeLevel ?? null,
        shift: shift ?? null,
      },
    });

    const subjects = [];
    for (const subjectName of uniqueSubjectNames) {
      const existing = await tx.subject.findFirst({
        where: { tenantId: user.tenantId, name: { equals: subjectName, mode: "insensitive" } },
      });
      const subject =
        existing ?? (await tx.subject.create({ data: { tenantId: user.tenantId, name: subjectName } }));
      await tx.classSubject.create({ data: { classId: klass.id, subjectId: subject.id } });
      subjects.push({ id: subject.id, name: subject.name });
    }

    return { klass, subjects };
  });

  return apiSuccess(
    {
      id: created.klass.id,
      name: created.klass.name,
      gradeLevel: created.klass.gradeLevel,
      shift: created.klass.shift,
      studentCount: 0,
      subjects: created.subjects,
    },
    201
  );
});
