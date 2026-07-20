import { Resend } from "resend";

/**
 * Cliente de e-mail. Falha de envio NUNCA derruba o fluxo que chamou —
 * mesmo princípio já usado no AuditLog: perder um e-mail de aviso é ruim,
 * perder o webhook que ativa o plano (porque o e-mail travou) é pior.
 */

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM ?? "AvaliaSmart <notificacoes@avaliasmart.app>";

/** Usado por quem precisa saber ANTES de chamar `sendEmail` se o envio é real ou vai virar no-op (ex.: `notification.service.ts`, que registra o resultado num log — não pode marcar "enviado" sem saber se there's client configurado). */
export function isEmailConfigured(): boolean {
  return resend !== null;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY não configurado — e-mail não enviado:", params.subject, "->", params.to);
    return;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments,
    });
  } catch (err) {
    console.error("[email] falha ao enviar:", params.subject, "->", params.to, err);
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function paymentReceivedEmail(params: { planName: string; validUntil: Date }) {
  return {
    subject: `Pagamento confirmado — plano ${params.planName}`,
    html: `
      <p>Recebemos seu pagamento e o plano <strong>${params.planName}</strong> já está ativo.</p>
      <p>Válido até <strong>${formatDate(params.validUntil)}</strong>.</p>
      <p style="color:#737373;font-size:12px;margin-top:24px;">AvaliaSmart</p>
    `,
  };
}

export function subscriptionExpiringSoonEmail(params: { planName: string; expiresAt: Date; daysRemaining: 3 | 0 }) {
  const subject =
    params.daysRemaining === 0
      ? "Sua assinatura vence hoje"
      : `Sua assinatura vence em ${params.daysRemaining} dias`;
  const whenText = params.daysRemaining === 0 ? "vence <strong>hoje</strong>" : `vence em <strong>${formatDate(params.expiresAt)}</strong>`;
  return {
    subject,
    html: `
      <p>Seu plano <strong>${params.planName}</strong> ${whenText}.</p>
      <p>Renove em <a href="https://avaliasmart.app/planos">avaliasmart.app/planos</a> pra não perder acesso.</p>
      <p style="color:#737373;font-size:12px;margin-top:24px;">AvaliaSmart</p>
    `,
  };
}

export function workspaceInviteEmail(params: { tenantName: string; inviterName: string; acceptUrl: string; roleLabel: string }) {
  return {
    subject: `${params.inviterName} te convidou pra ${params.tenantName} — AvaliaSmart`,
    html: `
      <p><strong>${params.inviterName}</strong> te convidou pra entrar em <strong>${params.tenantName}</strong> como <strong>${params.roleLabel}</strong>.</p>
      <p><a href="${params.acceptUrl}">Clique aqui pra aceitar o convite</a> — o link expira em 48 horas.</p>
      <p>Se você não esperava este convite, pode ignorar este e-mail.</p>
      <p style="color:#737373;font-size:12px;margin-top:24px;">AvaliaSmart</p>
    `,
  };
}

export function consecutiveAbsencesEmail(params: {
  studentName: string;
  subjectName: string;
  className: string;
  consecutiveCount: number;
}) {
  return {
    subject: `${params.studentName} atingiu ${params.consecutiveCount} faltas seguidas em ${params.subjectName}`,
    html: `
      <p><strong>${params.studentName}</strong> (${params.className}) atingiu <strong>${params.consecutiveCount} faltas consecutivas</strong> em <strong>${params.subjectName}</strong>.</p>
      <p>Vale a pena checar se está tudo bem com o aluno.</p>
      <p style="color:#737373;font-size:12px;margin-top:24px;">AvaliaSmart</p>
    `,
  };
}

export function riskAlertEmail(params: {
  studentName: string;
  className: string;
  reasons: string[];
}) {
  return {
    subject: `${params.studentName} está em risco de reprovação — ${params.className}`,
    html: `
      <p><strong>${params.studentName}</strong> (${params.className}) apresenta sinal de risco:</p>
      <ul>${params.reasons.map((r) => `<li>${r}</li>`).join("")}</ul>
      <p>Vale a pena agir antes do bimestre fechar.</p>
      <p style="color:#737373;font-size:12px;margin-top:24px;">AvaliaSmart</p>
    `,
  };
}

export function essayGradedEmail(params: {
  studentLabel: string | null;
  gradedBy: "ai" | "human";
  overallScore: number;
  overallMaxScore: number;
}) {
  const who = params.gradedBy === "ai" ? "por IA (sugestão)" : "manualmente";
  return {
    subject: `Correção de redação concluída${params.studentLabel ? ` — ${params.studentLabel}` : ""}`,
    html: `
      <p>A correção${params.studentLabel ? ` de <strong>${params.studentLabel}</strong>` : ""} foi concluída ${who}.</p>
      <p>Nota: <strong>${params.overallScore}/${params.overallMaxScore}</strong>.</p>
      <p style="color:#737373;font-size:12px;margin-top:24px;">AvaliaSmart</p>
    `,
  };
}

export function passwordResetEmail(params: { resetUrl: string }) {
  return {
    subject: "Redefinir sua senha — AvaliaSmart",
    html: `
      <p>Pediram a redefinição da sua senha.</p>
      <p><a href="${params.resetUrl}">Clique aqui pra criar uma nova senha</a> — o link expira em 1 hora e só funciona uma vez.</p>
      <p>Se não foi você, ignore este e-mail — nada muda na sua conta.</p>
      <p style="color:#737373;font-size:12px;margin-top:24px;">AvaliaSmart</p>
    `,
  };
}
