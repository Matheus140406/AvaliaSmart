import { beforeEach, describe, expect, it, vi } from "vitest";

const findActiveTemplatesForTrigger = vi.fn();
const createNotificationLog = vi.fn();
const markNotificationLogSent = vi.fn();
const markNotificationLogFailed = vi.fn();

vi.mock("@/repositories/notification.repository", () => ({
  findActiveTemplatesForTrigger: (...args: unknown[]) => findActiveTemplatesForTrigger(...args),
  createNotificationLog: (...args: unknown[]) => createNotificationLog(...args),
  markNotificationLogSent: (...args: unknown[]) => markNotificationLogSent(...args),
  markNotificationLogFailed: (...args: unknown[]) => markNotificationLogFailed(...args),
}));

const sendEmail = vi.fn();
const isEmailConfigured = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  isEmailConfigured: (...args: unknown[]) => isEmailConfigured(...args),
}));

import { renderTemplate, dispatchNotification } from "@/services/notification.service";

beforeEach(() => {
  vi.clearAllMocks();
  isEmailConfigured.mockReturnValue(true);
});

describe("renderTemplate", () => {
  it("substitui todos os placeholders conhecidos", () => {
    const result = renderTemplate("Olá {{responsavel}}, {{nome_aluno}} faltou em {{disciplina}}.", {
      responsavel: "Sr. Silva",
      nome_aluno: "Ana",
      disciplina: "Matemática",
    });
    expect(result).toBe("Olá Sr. Silva, Ana faltou em Matemática.");
  });

  it("mantém placeholder sem valor correspondente (nunca vira string vazia silenciosamente)", () => {
    expect(renderTemplate("Nota: {{nota}}", {})).toBe("Nota: {{nota}}");
  });

  it("ignora texto que não é placeholder", () => {
    expect(renderTemplate("Sem chaves aqui.", { x: "y" })).toBe("Sem chaves aqui.");
  });
});

describe("dispatchNotification", () => {
  const baseParams = {
    tenantId: "t1",
    trigger: "FALTA_EXCESSIVA" as const,
    to: "prof@escola.com",
    studentId: "s1",
    vars: { nome_aluno: "Ana", disciplina: "Matemática", turma: "9A" },
  };

  it("devolve no-template quando o tenant não tem template ativo pro trigger (estado hoje, sem UI de admin)", async () => {
    findActiveTemplatesForTrigger.mockResolvedValue([]);
    const outcome = await dispatchNotification(baseParams);
    expect(outcome).toEqual({ sent: false, reason: "no-template" });
    expect(createNotificationLog).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("envia por e-mail quando existe template ativo do canal EMAIL", async () => {
    findActiveTemplatesForTrigger.mockResolvedValue([
      { id: "tpl1", channel: "EMAIL", name: "Aviso de falta", body: "{{nome_aluno}} faltou em {{disciplina}}." },
    ]);
    createNotificationLog.mockResolvedValue({ id: "log1" });

    const outcome = await dispatchNotification(baseParams);

    expect(outcome).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledWith({
      to: "prof@escola.com",
      subject: "Aviso de falta",
      html: "Ana faltou em Matemática.",
    });
    expect(markNotificationLogSent).toHaveBeenCalledWith("log1");
  });

  it("prioriza o template EMAIL quando há vários templates ativos pro mesmo trigger", async () => {
    findActiveTemplatesForTrigger.mockResolvedValue([
      { id: "tpl-whatsapp", channel: "WHATSAPP", name: "W", body: "x" },
      { id: "tpl-email", channel: "EMAIL", name: "E", body: "y" },
    ]);
    createNotificationLog.mockResolvedValue({ id: "log1" });

    await dispatchNotification(baseParams);

    expect(createNotificationLog).toHaveBeenCalledWith(expect.objectContaining({ templateId: "tpl-email" }));
  });

  it("marca FALHOU explicitamente pra template de canal não suportado (WHATSAPP/SMS) — nunca finge que enviou", async () => {
    findActiveTemplatesForTrigger.mockResolvedValue([{ id: "tpl1", channel: "WHATSAPP", name: "W", body: "x" }]);
    createNotificationLog.mockResolvedValue({ id: "log1" });

    const outcome = await dispatchNotification(baseParams);

    expect(outcome).toEqual({ sent: false, reason: "unsupported-channel" });
    expect(markNotificationLogFailed).toHaveBeenCalledWith("log1", { reason: "canal não suportado" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("marca FALHOU (não ENVIADA) quando RESEND_API_KEY não está configurado — sendEmail nunca lança, então checa a config antes", async () => {
    findActiveTemplatesForTrigger.mockResolvedValue([{ id: "tpl1", channel: "EMAIL", name: "E", body: "x" }]);
    createNotificationLog.mockResolvedValue({ id: "log1" });
    isEmailConfigured.mockReturnValue(false);

    const outcome = await dispatchNotification(baseParams);

    expect(outcome).toEqual({ sent: false, reason: "send-failed" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(markNotificationLogSent).not.toHaveBeenCalled();
  });
});
