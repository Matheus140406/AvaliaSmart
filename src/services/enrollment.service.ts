import type { MembershipRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/http/errors";

/**
 * Desmatricular (Etapa chamada) — remove o aluno da lista de chamada/turma
 * sem apagar nada: vira `Enrollment.status = "CANCELADA"`, então todo
 * histórico já lançado (Attendance, Grade) continua intacto, referenciando
 * a mesma Enrollment — só para de aparecer nas listas que filtram por
 * `status: "ATIVA"` (chamada, grade grid, etc.).
 */
export async function unenrollStudent(params: {
  tenantId: string;
  role: MembershipRole;
  classId: string;
  enrollmentId: string;
}) {
  const klass = await prisma.class.findFirst({ where: { id: params.classId, tenantId: params.tenantId } });
  if (!klass) {
    throw notFound("Turma não encontrada.");
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { id: params.enrollmentId, classId: params.classId },
  });
  if (!enrollment) {
    throw notFound("Matrícula não encontrada nesta turma.");
  }

  return prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { status: "CANCELADA" },
  });
}
