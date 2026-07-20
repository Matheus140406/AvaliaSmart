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

import { generateSubstituteBriefing } from "@/services/ai/substitute-briefing.service";

function performanceData(students: { studentId: string; name: string; average: number | null; attendancePct: number }[]) {
  return {
    className: "9º Ano A",
    termName: "1º Bimestre",
    previousTermName: null,
    subjects: [{ subjectName: "Matemática", currentAverage: 7, previousAverage: null, deltaPct: null }],
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

describe("generateSubstituteBriefing", () => {
  it("devolve 404 quando a turma/período não existe pro tenant", async () => {
    getClassPerformanceData.mockResolvedValue(null);
    await expect(
      generateSubstituteBriefing({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("devolve 400 quando a turma não tem alunos matriculados", async () => {
    getClassPerformanceData.mockResolvedValue(performanceData([]));
    await expect(
      generateSubstituteBriefing({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("nunca envia nome real no prompt — só rótulo posicional Aluno_N", async () => {
    getClassPerformanceData.mockResolvedValue(
      performanceData([{ studentId: "s1", name: "Ana Beatriz Souza", average: 8, attendancePct: 95 }])
    );
    generate.mockResolvedValue({
      success: true,
      data: { overview: "Turma com bom desempenho geral.", attentionStudents: [], tips: ["Revisar frações.", "Manter ritmo atual."] },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    await generateSubstituteBriefing({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" });

    const promptArg = generate.mock.calls[0][0].prompt as string;
    expect(promptArg).not.toContain("Ana Beatriz Souza");
    expect(promptArg).toContain("Aluno_1");
  });

  it("remapeia studentLabel de volta pro studentId/nome reais nos alunos em atenção", async () => {
    getClassPerformanceData.mockResolvedValue(
      performanceData([
        { studentId: "s1", name: "Ana", average: 3, attendancePct: 60 },
        { studentId: "s2", name: "Bruno", average: 9, attendancePct: 98 },
      ])
    );
    generate.mockResolvedValue({
      success: true,
      data: {
        overview: "Turma heterogênea.",
        attentionStudents: [{ studentLabel: "Aluno_1", reason: "Média baixa e faltas altas." }],
        tips: ["Monitorar de perto.", "Reforçar conteúdo básico."],
      },
      usage: { inputTokens: 20, outputTokens: 10 },
    });

    const result = await generateSubstituteBriefing({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" });

    expect(result.attentionStudents).toEqual([{ studentId: "s1", studentName: "Ana", reason: "Média baixa e faltas altas." }]);
    expect(result.className).toBe("9º Ano A");
    expect(result.tips).toHaveLength(2);
  });

  it("descarta rótulos que a IA inventou ou alterou, sem quebrar os demais", async () => {
    getClassPerformanceData.mockResolvedValue(
      performanceData([{ studentId: "s1", name: "Ana", average: 7, attendancePct: 90 }])
    );
    generate.mockResolvedValue({
      success: true,
      data: {
        overview: "Turma ok.",
        attentionStudents: [
          { studentLabel: "Aluno_1", reason: "Ok." },
          { studentLabel: "Aluno_99", reason: "Rótulo inexistente." },
        ],
        tips: ["Dica 1.", "Dica 2."],
      },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const result = await generateSubstituteBriefing({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" });
    expect(result.attentionStudents).toHaveLength(1);
    expect(result.attentionStudents[0].studentId).toBe("s1");
  });

  it("registra o uso de IA com a feature RESUMO_SUBSTITUTO, mesmo em falha", async () => {
    getClassPerformanceData.mockResolvedValue(
      performanceData([{ studentId: "s1", name: "Ana", average: 7, attendancePct: 90 }])
    );
    generate.mockResolvedValue({ success: false, error: "sem cota" });

    await expect(
      generateSubstituteBriefing({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" })
    ).rejects.toThrow();

    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", membershipId: "m1", feature: "RESUMO_SUBSTITUTO", success: false })
    );
  });

  it("propaga falha do provedor de IA como HttpError 502", async () => {
    getClassPerformanceData.mockResolvedValue(
      performanceData([{ studentId: "s1", name: "Ana", average: 7, attendancePct: 90 }])
    );
    generate.mockResolvedValue({ success: false, error: "Não foi possível gerar a resposta de IA agora." });

    await expect(
      generateSubstituteBriefing({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" })
    ).rejects.toMatchObject({ status: 502 });
  });

  it("informa quantos alunos ficaram de fora quando a turma excede o teto por chamada", async () => {
    const bigRoster = Array.from({ length: 90 }, (_, i) => ({
      studentId: `s${i}`,
      name: `Aluno Real ${i}`,
      average: 5,
      attendancePct: 80,
    }));
    getClassPerformanceData.mockResolvedValue(performanceData(bigRoster));
    generate.mockResolvedValue({
      success: true,
      data: { overview: "Turma grande.", attentionStudents: [], tips: ["Dica 1.", "Dica 2."] },
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const result = await generateSubstituteBriefing({ tenantId: "t1", membershipId: "m1", classId: "c1", termId: "term1" });
    expect(result.studentsOmitted).toBe(30);
  });
});

describe("HttpError sanity", () => {
  it("confirma que HttpError segue exportando status/message (usado pelos matchers acima)", () => {
    const err = new HttpError(404, "x");
    expect(err.status).toBe(404);
  });
});
