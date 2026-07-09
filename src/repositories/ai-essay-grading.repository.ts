import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export function createEssayGrading(params: {
  tenantId: string;
  membershipId: string;
  studentLabel?: string;
  gradedBy: "ai" | "human";
  essayText?: string;
  content: Prisma.InputJsonValue;
}) {
  return prisma.aiEssayGrading.create({ data: params });
}

export function findEssayGradingById(id: string) {
  return prisma.aiEssayGrading.findUnique({ where: { id } });
}

export interface EssayGradingHistoryFilters {
  gradedBy?: "ai" | "human";
  from?: Date;
  to?: Date;
}

/** Histórico de redações do MESMO aluno (match por `studentLabel`, best-effort — ver comentário no schema) — usado pelo corretor manual pra consultar avaliações anteriores, IA ou humanas. Filtros de período/gradedBy são opcionais, aplicados em cima do match por aluno. */
export function findEssayGradingHistoryByStudentLabel(
  tenantId: string,
  studentLabel: string,
  filters: EssayGradingHistoryFilters = {}
) {
  return prisma.aiEssayGrading.findMany({
    where: {
      tenantId,
      studentLabel: { equals: studentLabel, mode: "insensitive" },
      ...(filters.gradedBy ? { gradedBy: filters.gradedBy } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
