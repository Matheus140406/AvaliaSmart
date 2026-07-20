import { beforeEach, describe, expect, it, vi } from "vitest";

const findClassSubjectWithClass = vi.fn();
vi.mock("@/repositories/class-subject.repository", () => ({
  findClassSubjectWithClass: (...a: unknown[]) => findClassSubjectWithClass(...a),
}));

const findMonthlyAttendance = vi.fn();
vi.mock("@/repositories/attendance.repository", () => ({
  findMonthlyAttendance: (...a: unknown[]) => findMonthlyAttendance(...a),
  findActiveEnrollmentsWithAttendance: vi.fn(),
  findEnrollmentById: vi.fn(),
  upsertAttendance: vi.fn(),
}));

import { getMonthlyAttendanceReport } from "@/services/attendance.service";

const baseParams = { tenantId: "t1", role: "ADMIN" as const, membershipId: "m1", classSubjectId: "cs1", month: "2026-07" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMonthlyAttendanceReport", () => {
  it("devolve 404 quando a turma/disciplina não pertence ao tenant", async () => {
    findClassSubjectWithClass.mockResolvedValue({ class: { tenantId: "outro-tenant" } });
    await expect(getMonthlyAttendanceReport(baseParams)).rejects.toMatchObject({ status: 404 });
  });

  it("devolve 403 quando um PROFESSOR pede o relatório de uma disciplina que não leciona", async () => {
    findClassSubjectWithClass.mockResolvedValue({ classId: "c1", teacherId: "outro-membership", class: { tenantId: "t1" } });
    await expect(getMonthlyAttendanceReport({ ...baseParams, role: "PROFESSOR" })).rejects.toMatchObject({ status: 403 });
  });

  it("devolve 400 quando o mês está em formato inválido", async () => {
    findClassSubjectWithClass.mockResolvedValue({ classId: "c1", teacherId: "m1", class: { tenantId: "t1" } });
    await expect(getMonthlyAttendanceReport({ ...baseParams, month: "07/2026" })).rejects.toMatchObject({ status: 400 });
  });

  it("monta as colunas de dia só com datas que tiveram chamada lançada, calcula faltas e frequência", async () => {
    findClassSubjectWithClass.mockResolvedValue({
      classId: "c1",
      teacherId: "m1",
      class: { tenantId: "t1", name: "9º Ano A" },
      subject: { name: "Matemática" },
    });
    findMonthlyAttendance.mockResolvedValue([
      {
        student: { name: "Ana", registrationCode: "001" },
        attendances: [
          { date: new Date(Date.UTC(2026, 6, 3)), present: true, justified: false },
          { date: new Date(Date.UTC(2026, 6, 10)), present: false, justified: true },
          { date: new Date(Date.UTC(2026, 6, 17)), present: false, justified: false },
        ],
      },
      {
        student: { name: "Bruno", registrationCode: null },
        attendances: [{ date: new Date(Date.UTC(2026, 6, 3)), present: true, justified: false }],
      },
    ]);

    const report = await getMonthlyAttendanceReport(baseParams);

    expect(report.className).toBe("9º Ano A");
    expect(report.subjectName).toBe("Matemática");
    expect(report.days).toEqual([3, 10, 17]);

    const ana = report.students.find((s) => s.studentName === "Ana")!;
    expect(ana.marksByDay).toEqual({ 3: "P", 10: "J", 17: "F" });
    expect(ana.totalPresences).toBe(1);
    expect(ana.totalAbsences).toBe(2);
    expect(ana.attendancePct).toBeCloseTo(33.33, 1);

    const bruno = report.students.find((s) => s.studentName === "Bruno")!;
    expect(bruno.marksByDay).toEqual({ 3: "P" });
    expect(bruno.attendancePct).toBe(100);
  });

  it("aluno sem nenhuma chamada lançada no mês tem 100% de frequência (nada registrado, não é falta)", async () => {
    findClassSubjectWithClass.mockResolvedValue({
      classId: "c1",
      teacherId: "m1",
      class: { tenantId: "t1", name: "9º Ano A" },
      subject: { name: "Matemática" },
    });
    findMonthlyAttendance.mockResolvedValue([{ student: { name: "Carla", registrationCode: null }, attendances: [] }]);

    const report = await getMonthlyAttendanceReport(baseParams);
    expect(report.days).toEqual([]);
    expect(report.students[0].attendancePct).toBe(100);
  });
});
