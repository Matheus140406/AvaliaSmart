import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export function createLessonPlan(params: {
  tenantId: string;
  membershipId: string;
  title: string;
  content: Prisma.InputJsonValue;
}) {
  return prisma.aiLessonPlan.create({ data: params });
}

export function findLessonPlanById(id: string) {
  return prisma.aiLessonPlan.findUnique({ where: { id } });
}
