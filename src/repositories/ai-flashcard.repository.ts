import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export function createFlashcardSet(params: {
  tenantId: string;
  membershipId: string;
  title: string;
  content: Prisma.InputJsonValue;
}) {
  return prisma.aiFlashcardSet.create({ data: params });
}

export function findFlashcardSetById(id: string) {
  return prisma.aiFlashcardSet.findUnique({ where: { id } });
}
