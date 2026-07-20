import { sendEmail, isEmailConfigured } from "@/lib/email/resend";
import {
  findActiveTemplatesForTrigger,
  createNotificationLog,
  markNotificationLogSent,
  markNotificationLogFailed,
} from "@/repositories/notification.repository";
import type { NotificationTrigger } from "@prisma/client";

/**
 * Motor de notificações — os models (`NotificationTemplate`/`NotificationLog`)
 * e os enums (`NotificationChannel`/`NotificationTrigger`) existiam no
 * schema desde sempre, sem UMA linha de código de envio. MVP: só o canal
 * EMAIL manda de verdade (reaproveita `lib/email/resend.ts`, já usado em 6
 * e-mails transacionais); WHATSAPP/SMS não têm integração nenhuma — um
 * template desses canais é registrado como FALHOU, explicitamente, nunca
 * fingido como enviado.
 *
 * Sem UI de administração de templates nesta rodada (fora de escopo) — hoje
 * nenhum tenant tem um `NotificationTemplate` cadastrado, então
 * `dispatchNotification` sempre devolve `{sent:false, reason:"no-template"}`
 * na prática; os chamadores (ex.: `attendance-alert.service.ts`) usam isso
 * como sinal pra cair no e-mail hard-coded que já existia, preservando o
 * comportamento atual até alguém cadastrar um template pelo banco.
 */

/** Substitui `{{placeholder}}` pelos valores em `vars` — placeholder sem valor correspondente fica como está (nunca vira string vazia silenciosamente). */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => vars[key] ?? match);
}

export type DispatchOutcome =
  | { sent: true }
  | { sent: false; reason: "no-template" | "unsupported-channel" | "send-failed" };

export interface DispatchNotificationParams {
  tenantId: string;
  trigger: NotificationTrigger;
  /** Endereço de entrega — quem é o destinatário é decisão do CHAMADOR (o trigger não define isso; um mesmo trigger pode notificar professor, responsável, etc. dependendo de quem chama). */
  to: string;
  studentId?: string;
  guardianId?: string;
  vars: Record<string, string>;
}

export async function dispatchNotification(params: DispatchNotificationParams): Promise<DispatchOutcome> {
  const templates = await findActiveTemplatesForTrigger(params.tenantId, params.trigger);
  if (templates.length === 0) {
    return { sent: false, reason: "no-template" };
  }

  // Só EMAIL está implementado — se houver template desse canal pro
  // trigger, prioriza ele; senão usa o primeiro ativo (pra deixar o log
  // registrado como FALHOU/canal não suportado, não pra "sumir" o template).
  const template = templates.find((t) => t.channel === "EMAIL") ?? templates[0];

  const log = await createNotificationLog({
    templateId: template.id,
    studentId: params.studentId,
    guardianId: params.guardianId,
    channel: template.channel,
  });

  if (template.channel !== "EMAIL") {
    await markNotificationLogFailed(log.id, { reason: "canal não suportado" });
    return { sent: false, reason: "unsupported-channel" };
  }

  // `sendEmail` nunca lança (engole erro do provider internamente, mesmo
  // padrão do AuditLog) — então o único jeito confiável de saber se o envio
  // é real ou vai virar no-op é checar a config ANTES de chamar, pra não
  // marcar ENVIADA uma notificação que na prática só foi logada no console.
  if (!isEmailConfigured()) {
    await markNotificationLogFailed(log.id, { reason: "RESEND_API_KEY não configurado" });
    return { sent: false, reason: "send-failed" };
  }

  await sendEmail({ to: params.to, subject: template.name, html: renderTemplate(template.body, params.vars) });
  await markNotificationLogSent(log.id);
  return { sent: true };
}
