import { prisma } from "@/lib/prisma";

export function listObservationTemplates(tenantId: string) {
  return prisma.observationTemplate.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}

export function createObservationTemplate(data: { tenantId: string; membershipId: string; text: string }) {
  return prisma.observationTemplate.create({ data });
}

export function findObservationTemplateById(id: string) {
  return prisma.observationTemplate.findUnique({ where: { id } });
}

export function deleteObservationTemplate(id: string) {
  return prisma.observationTemplate.delete({ where: { id } });
}
