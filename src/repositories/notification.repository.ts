import { prisma } from "@/lib/prisma";
import type { NotificationChannel, NotificationTrigger, NotificationStatus } from "@prisma/client";

/** Todos os templates ATIVOS do tenant pra esse trigger (qualquer canal) — a escolha de qual canal usar é do chamador (notification.service.ts), não do repository. */
export function findActiveTemplatesForTrigger(tenantId: string, trigger: NotificationTrigger) {
  return prisma.notificationTemplate.findMany({
    where: { tenantId, trigger, active: true },
  });
}

export function createNotificationLog(data: {
  templateId: string;
  studentId?: string;
  guardianId?: string;
  channel: NotificationChannel;
}) {
  return prisma.notificationLog.create({
    data: {
      templateId: data.templateId,
      studentId: data.studentId,
      guardianId: data.guardianId,
      channel: data.channel,
      status: "PENDENTE",
    },
  });
}

export function markNotificationLogSent(id: string) {
  return prisma.notificationLog.update({
    where: { id },
    data: { status: "ENVIADA", sentAt: new Date() },
  });
}

export function markNotificationLogFailed(id: string, payload: unknown) {
  return prisma.notificationLog.update({
    where: { id },
    data: { status: "FALHOU" satisfies NotificationStatus, payload: payload as never },
  });
}
