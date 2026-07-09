import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden, notFound } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";

interface Context {
  params: Promise<{ classId: string }>;
}

const createStudentSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do aluno."),
  registrationCode: z.string().trim().min(1).optional(),
  birthDate: z.string().trim().min(1).optional(),
});

/**
 * POST /api/turmas/[classId]/alunos — cadastro simples de UM aluno na
 * turma (formulário por aluno, complementar ao fluxo de importar planilha
 * já existente em `/importar` — aquele exige `classSubjectId`+`termId`
 * porque nasceu pra importar NOTAS; este aqui só precisa da turma, pra
 * cobrir o caso de adicionar um aluno avulso sem passar por uma planilha).
 * Cria `Student` + `Enrollment` na mesma transação — sem a Enrollment o
 * aluno existiria mas não apareceria em nenhuma lista de turma.
 */
export const POST = withTenant<Context>(async (request, user, context) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para cadastrar alunos.");
  }

  const { classId } = await context.params;

  const klass = await prisma.class.findFirst({ where: { id: classId, tenantId: user.tenantId } });
  if (!klass) {
    throw notFound("Turma não encontrada.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createStudentSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }
  const { name, registrationCode, birthDate } = parsed.data;

  const parsedBirthDate = birthDate ? new Date(birthDate) : null;
  if (birthDate && (!parsedBirthDate || Number.isNaN(parsedBirthDate.getTime()))) {
    throw badRequest("Data de nascimento inválida.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        tenantId: user.tenantId,
        name,
        registrationCode: registrationCode ?? null,
        birthDate: parsedBirthDate,
      },
    });
    const enrollment = await tx.enrollment.create({
      data: {
        studentId: student.id,
        classId: klass.id,
        academicYearId: klass.academicYearId,
      },
    });
    return { student, enrollment };
  });

  return apiSuccess(
    {
      id: created.student.id,
      name: created.student.name,
      registrationCode: created.student.registrationCode,
      enrollmentId: created.enrollment.id,
    },
    201
  );
});
