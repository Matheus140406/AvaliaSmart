import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http/errors";

const getClassPerformanceData = vi.fn();
vi.mock("@/repositories/performance.repository", () => ({
  getClassPerformanceData: (...args: unknown[]) => getClassPerformanceData(...args),
}));

const generate = vi.fn();
vi.mock("@/services/ai/ai.service", () => ({
  generate: (...args: unknown[]) => generate(...args),
}));

const recordAiUsage = vi.fn();
vi.mock("@/services/ai/guard", () => ({
  recordAiUsage: (...args: unknown[]) => recordAiUsage(...args),
}));

import { predictClassRisk } from "@/services/ai/risk-prediction.service";

function performanceData(students: { studentId: string; name: string; average: number | null; attendancePct: number }[]) {
  return {
    className: "9º Ano A",
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
});

describe("predictClassRisk", () => {
  it("devolve 404 quando a turma/período não existe pro tenant", async () => {
    getClassPerformanceData.mockResolvedValue(null);
    await expect(
      predictClassRisk({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("devolve 400 quando a turma não tem alunos matriculados", async () => {
    getClassPerformanceData.mockResolvedValue(performanceData([]));
    await expect(
      predictClassRisk({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("nunca envia nome real no prompt — só rótulo posicional Aluno_N", async () => {
    getClassPerformanceData.mockResolvedValue(
      performanceData([{ studentId: "s1", name: "Ana Beatriz Souza", average: 8, attendancePct: 95 }])
    );
    generate.mockResolvedValue({
      success: true,
      data: { assessments: [{ studentLabel: "Aluno_1", riskLevel: "BAIXO", reasoning: "Média alta e boa frequência." }] },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    await predictClassRisk({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" });

    const promptArg = generate.mock.calls[0][0].prompt as string;
    expect(promptArg).not.toContain("Ana Beatriz Souza");
    expect(promptArg).toContain("Aluno_1");
  });

  it("remapeia studentLabel de volta pro studentId/nome reais na resposta", async () => {
    getClassPerformanceData.mockResolvedValue(
      performanceData([
        { studentId: "s1", name: "Ana", average: 3, attendancePct: 60 },
        { studentId: "s2", name: "Bruno", average: 9, attendancePct: 98 },
      ])
    );
    generate.mockResolvedValue({
      success: true,
      data: {
        assessments: [
          { studentLabel: "Aluno_1", riskLevel: "ALTO", reasoning: "Média baixa e faltas altas." },
          { studentLabel: "Aluno_2", riskLevel: "BAIXO", reasoning: "Tudo bem." },
        ],
      },
      usage: { inputTokens: 20, outputTokens: 10 },
    });

    const result = await predictClassRisk({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" });

    expect(result).toEqual([
      { studentId: "s1", studentName: "Ana", riskLevel: "ALTO", reasoning: "Média baixa e faltas altas." },
      { studentId: "s2", studentName: "Bruno", riskLevel: "BAIXO", reasoning: "Tudo bem." },
    ]);
  });

  it("descarta rótulos que a IA inventou ou alterou, sem quebrar os demais", async () => {
    getClassPerformanceData.mockResolvedValue(
      performanceData([{ studentId: "s1", name: "Ana", average: 7, attendancePct: 90 }])
    );
    generate.mockResolvedValue({
      success: true,
      data: {
        assessments: [
          { studentLabel: "Aluno_1", riskLevel: "BAIXO", reasoning: "Ok." },
          { studentLabel: "Aluno_99", riskLevel: "ALTO", reasoning: "Rótulo inexistente." },
        ],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const result = await predictClassRisk({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" });
    expect(result).toHaveLength(1);
    expect(result[0].studentId).toBe("s1");
  });

  it("registra o uso de IA com a feature PREDICAO_RISCO, mesmo em sucesso e falha", async () => {
    getClassPerformanceData.mockResolvedValue(
      performanceData([{ studentId: "s1", name: "Ana", average: 7, attendancePct: 90 }])
    );
    generate.mockResolvedValue({ success: false, error: "sem cota" });

    await expect(
      predictClassRisk({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" })
    ).rejects.toThrow();

    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", membershipId: "m1", feature: "PREDICAO_RISCO", success: false })
    );
  });

  it("propaga falha do provedor de IA como HttpError 502", async () => {
    getClassPerformanceData.mockResolvedValue(
      performanceData([{ studentId: "s1", name: "Ana", average: 7, attendancePct: 90 }])
    );
    generate.mockResolvedValue({ success: false, error: "Não foi possível gerar a resposta de IA agora." });

    await expect(
      predictClassRisk({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" })
    ).rejects.toMatchObject({ status: 502 });
  });

  it("trunca o roster em MAX_STUDENTS_PER_CALL sem lançar erro", async () => {
    const bigRoster = Array.from({ length: 90 }, (_, i) => ({
      studentId: `s${i}`,
      name: `Aluno Real ${i}`,
      average: 5,
      attendancePct: 80,
    }));
    getClassPerformanceData.mockResolvedValue(performanceData(bigRoster));
    generate.mockResolvedValue({
      success: true,
      data: { assessments: [{ studentLabel: "Aluno_1", riskLevel: "MEDIO", reasoning: "Ok." }] },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const result = await predictClassRisk({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" });
    expect(result).toHaveLength(1);
    const promptArg = generate.mock.calls[0][0].prompt as string;
    expect(promptArg).not.toContain("Aluno_61");
  });
});

describe("HttpError sanity", () => {
  it("confirma que HttpError segue exportando status/message (usado pelos matchers acima)", () => {
    const err = new HttpError(404, "x");
    expect(err.status).toBe(404);
  });
});
