import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export function createGeneratedExam(params: {
  tenantId: string;
  membershipId: string;
  title: string;
  content: Prisma.InputJsonValue;
}) {
  return prisma.aiGeneratedExam.create({ data: params });
}

export function findGeneratedExamById(id: string) {
  return prisma.aiGeneratedExam.findUnique({ where: { id } });
}
