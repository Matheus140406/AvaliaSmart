import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/http/errors";

const TERM_NAMES = ["1º Bimestre", "2º Bimestre", "3º Bimestre", "4º Bimestre"];

/**
 * Ativa o ano letivo `year` do tenant — cria (com os 4 bimestres padrão,
 * mesmo formato de `POST /api/workspaces`) se ainda não existir, ou só
 * reativa se já existir mas estiver inativo. Só um ano letivo fica ativo
 * por vez (mesma suposição do resto do app — `Class.academicYearId`
 * sempre aponta pro ano ATIVO no momento da criação da turma), então
 * qualquer outro ano ativo do tenant é desativado na mesma transação.
 */
export async function activateAcademicYear(tenantId: string, year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw badRequest("Ano inválido.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.academicYear.updateMany({
      where: { tenantId, isActive: true },
      data: { isActive: false },
    });

    const existing = await tx.academicYear.findUnique({
      where: { tenantId_year: { tenantId, year } },
    });
    if (existing) {
      return tx.academicYear.update({ where: { id: existing.id }, data: { isActive: true } });
    }

    const academicYear = await tx.academicYear.create({
      data: {
        tenantId,
        year,
        startDate: new Date(`${year}-02-01`),
        endDate: new Date(`${year}-12-15`),
        isActive: true,
      },
    });
    for (let i = 0; i < TERM_NAMES.length; i++) {
      await tx.term.create({
        data: {
          academicYearId: academicYear.id,
          name: TERM_NAMES[i],
          order: i + 1,
          startDate: new Date(`${year}-0${2 + i * 2}-01`),
          endDate: new Date(`${year}-0${3 + i * 2}-30`),
        },
      });
    }
    return academicYear;
  });
}
