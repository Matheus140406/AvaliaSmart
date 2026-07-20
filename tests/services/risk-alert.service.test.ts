import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptionFindMany = vi.fn();
const academicYearFindFirst = vi.fn();
const termFindFirst = vi.fn();
const classFindMany = vi.fn();
const membershipFindFirst = vi.fn();
const riskAlertLogCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: { findMany: (...a: unknown[]) => subscriptionFindMany(...a) },
    academicYear: { findFirst: (...a: unknown[]) => academicYearFindFirst(...a) },
    term: { findFirst: (...a: unknown[]) => termFindFirst(...a) },
    class: { findMany: (...a: unknown[]) => classFindMany(...a) },
    membership: { findFirst: (...a: unknown[]) => membershipFindFirst(...a) },
    riskAlertLog: { create: (...a: unknown[]) => riskAlertLogCreate(...a) },
  },
}));

const resolveSubscription = vi.fn();
vi.mock("@/lib/billing/guard", () => ({
  resolveSubscription: (...a: unknown[]) => resolveSubscription(...a),
}));

const getClassPerformanceData = vi.fn();
vi.mock("@/repositories/performance.repository", () => ({
  getClassPerformanceData: (...a: unknown[]) => getClassPerformanceData(...a),
}));

const dispatchNotification = vi.fn();
vi.mock("@/services/notification.service", () => ({
  dispatchNotification: (...a: unknown[]) => dispatchNotification(...a),
}));

const sendEmail = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  riskAlertEmail: (params: unknown) => ({ subject: "x", html: "y", params }),
}));

import { checkRiskAlerts } from "@/services/risk-alert.service";

function student(overrides: Record<string, unknown> = {}) {
  return {
    name: "Ana",
    studentId: "s1",
    enrollmentId: "e1",
    average: 8,
    attendancePct: 90,
    ...overrides,
  };
}

function performanceData(students: ReturnType<typeof student>[]) {
  return {
    className: "9A",
    termName: "1º Bimestre",
    previousTermName: null,
    subjects: [],
    classAttendancePct: 90,
    studentsBelowAverage: [],
    studentsLowAttendance: [],
    allStudents: students,
    totalStudents: students.length,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  subscriptionFindMany.mockResolvedValue([{ tenantId: "t1" }]);
  resolveSubscription.mockResolvedValue({
    isUsable: true,
    plan: { features: { riskPrediction: true } },
  });
  academicYearFindFirst.mockResolvedValue({ id: "ay1" });
  termFindFirst.mockResolvedValue({ id: "term1" });
  classFindMany.mockResolvedValue([{ id: "c1", name: "9A" }]);
  membershipFindFirst.mockResolvedValue({ user: { email: "admin@escola.com" } });
  riskAlertLogCreate.mockResolvedValue({});
  dispatchNotification.mockResolvedValue({ sent: false, reason: "no-template" });
});

describe("checkRiskAlerts", () => {
  it("pula tenant sem plano com riskPrediction habilitado", async () => {
    resolveSubscription.mockResolvedValue({ isUsable: true, plan: { features: { riskPrediction: false } } });
    const result = await checkRiskAlerts();
    expect(result.alertsSent).toBe(0);
    expect(getClassPerformanceData).not.toHaveBeenCalled();
  });

  it("pula tenant sem assinatura usável", async () => {
    resolveSubscription.mockResolvedValue({ isUsable: false, plan: { features: { riskPrediction: true } } });
    const result = await checkRiskAlerts();
    expect(result.alertsSent).toBe(0);
  });

  it("pula tenant sem ano letivo ativo ou sem período", async () => {
    academicYearFindFirst.mockResolvedValue(null);
    expect((await checkRiskAlerts()).alertsSent).toBe(0);

    academicYearFindFirst.mockResolvedValue({ id: "ay1" });
    termFindFirst.mockResolvedValue(null);
    expect((await checkRiskAlerts()).alertsSent).toBe(0);
  });

  it("não alerta aluno sem nenhum risco (média e frequência ok)", async () => {
    getClassPerformanceData.mockResolvedValue(performanceData([student({ average: 8, attendancePct: 95 })]));
    const result = await checkRiskAlerts();
    expect(result.alertsSent).toBe(0);
    expect(riskAlertLogCreate).not.toHaveBeenCalled();
  });

  it("alerta por média baixa (abaixo de RECOVERY_THRESHOLD)", async () => {
    getClassPerformanceData.mockResolvedValue(performanceData([student({ average: 3, attendancePct: 95 })]));
    const result = await checkRiskAlerts();
    expect(result.alertsSent).toBe(1);
    expect(riskAlertLogCreate).toHaveBeenCalledWith({
      data: { enrollmentId: "e1", termId: "term1", riskType: "MEDIA_BAIXA" },
    });
    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", trigger: "RISCO_REPROVACAO", studentId: "s1" })
    );
  });

  it("alerta por frequência baixa (abaixo de 75%)", async () => {
    getClassPerformanceData.mockResolvedValue(performanceData([student({ average: 8, attendancePct: 60 })]));
    const result = await checkRiskAlerts();
    expect(result.alertsSent).toBe(1);
    expect(riskAlertLogCreate).toHaveBeenCalledWith({
      data: { enrollmentId: "e1", termId: "term1", riskType: "FREQUENCIA_BAIXA" },
    });
  });

  it("não considera aluno sem notas (average null) como risco de média", async () => {
    getClassPerformanceData.mockResolvedValue(performanceData([student({ average: null, attendancePct: 95 })]));
    const result = await checkRiskAlerts();
    expect(result.alertsSent).toBe(0);
  });

  it("cai no e-mail hard-coded (riskAlertEmail) quando não há template (comportamento hoje)", async () => {
    getClassPerformanceData.mockResolvedValue(performanceData([student({ average: 2, attendancePct: 95 })]));
    dispatchNotification.mockResolvedValue({ sent: false, reason: "no-template" });

    await checkRiskAlerts();

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "admin@escola.com" }));
  });

  it("NÃO manda o e-mail hard-coded quando dispatchNotification já enviou via template", async () => {
    getClassPerformanceData.mockResolvedValue(performanceData([student({ average: 2, attendancePct: 95 })]));
    dispatchNotification.mockResolvedValue({ sent: true });

    await checkRiskAlerts();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("dedup: não recria RiskAlertLog nem notifica de novo quando a constraint única já existe (P2002)", async () => {
    getClassPerformanceData.mockResolvedValue(performanceData([student({ average: 2, attendancePct: 95 })]));
    riskAlertLogCreate.mockRejectedValue(new Error("Unique constraint failed"));

    const result = await checkRiskAlerts();

    expect(result.alertsSent).toBe(0);
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  it("pula tenant sem nenhuma turma no ano letivo ativo", async () => {
    classFindMany.mockResolvedValue([]);
    const result = await checkRiskAlerts();
    expect(result.alertsSent).toBe(0);
    expect(getClassPerformanceData).not.toHaveBeenCalled();
  });

  it("pula tenant sem ADMIN com e-mail (nada a notificar)", async () => {
    membershipFindFirst.mockResolvedValue(null);
    getClassPerformanceData.mockResolvedValue(performanceData([student({ average: 1, attendancePct: 50 })]));
    const result = await checkRiskAlerts();
    expect(result.alertsSent).toBe(0);
    expect(getClassPerformanceData).not.toHaveBeenCalled();
  });

  it("soma alertas de múltiplos alunos/turmas/tenants", async () => {
    subscriptionFindMany.mockResolvedValue([{ tenantId: "t1" }, { tenantId: "t2" }]);
    classFindMany.mockResolvedValue([{ id: "c1", name: "9A" }, { id: "c2", name: "9B" }]);
    getClassPerformanceData.mockResolvedValue(
      performanceData([student({ average: 1, attendancePct: 50 }), student({ average: 8, attendancePct: 90, enrollmentId: "e2", studentId: "s2" })])
    );

    const result = await checkRiskAlerts();
    // alertsSent conta por ALUNO notificado (não por tipo de risco) — 2 tenants x 2 turmas x 1 aluno em risco = 4
    expect(result.alertsSent).toBe(4);
  });
});
