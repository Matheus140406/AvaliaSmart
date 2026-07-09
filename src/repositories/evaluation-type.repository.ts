import { prisma } from "@/lib/prisma";

export function listEvaluationTypes(tenantId: string, includeInactive = false) {
  return prisma.evaluationTypeOption.findMany({
    where: { tenantId, ...(includeInactive ? {} : { active: true }) },
    orderBy: { order: "asc" },
  });
}

export function findEvaluationTypeById(id: string) {
  return prisma.evaluationTypeOption.findUnique({ where: { id } });
}

export function findEvaluationTypeByName(tenantId: string, name: string) {
  return prisma.evaluationTypeOption.findFirst({
    where: { tenantId, name: { equals: name, mode: "insensitive" } },
  });
}

export async function nextEvaluationTypeOrder(tenantId: string): Promise<number> {
  const last = await prisma.evaluationTypeOption.findFirst({
    where: { tenantId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  return (last?.order ?? -1) + 1;
}

export function createEvaluationType(params: { tenantId: string; name: string; order: number }) {
  return prisma.evaluationTypeOption.create({ data: params });
}

export function updateEvaluationType(id: string, data: { name?: string; active?: boolean }) {
  return prisma.evaluationTypeOption.update({ where: { id }, data });
}

export function countGradeConfigsUsingType(typeId: string): Promise<number> {
  return prisma.gradeConfig.count({ where: { typeId } });
}

export function deleteEvaluationType(id: string) {
  return prisma.evaluationTypeOption.delete({ where: { id } });
}

/** Conjunto padrão semeado em todo tenant novo (POST /api/workspaces) — mesmos 8 usados no backfill da migration. */
export const DEFAULT_EVALUATION_TYPE_NAMES = [
  "Prova",
  "Trabalho",
  "Participação",
  "Projeto",
  "Recuperação",
  "Diagnóstica",
  "Seminário",
  "Outro",
] as const;
