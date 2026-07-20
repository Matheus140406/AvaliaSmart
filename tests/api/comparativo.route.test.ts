import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
}));

const getClassPerformanceData = vi.fn();
vi.mock("@/repositories/performance.repository", () => ({
  getClassPerformanceData: (...args: unknown[]) => getClassPerformanceData(...args),
}));

import { GET } from "@/app/api/turmas/[classId]/comparativo/route";

function professor() {
  return { id: "m1", tenantId: "t1", role: "PROFESSOR" };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/turmas/[classId]/comparativo", () => {
  it("devolve 401 sem sessão", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/turmas/c1/comparativo?termId=term1"), {
      params: Promise.resolve({ classId: "c1" }),
    });
    expect(res.status).toBe(401);
  });

  it("devolve 400 sem termId", async () => {
    getCurrentUser.mockResolvedValue(professor());
    const res = await GET(new NextRequest("http://localhost/api/turmas/c1/comparativo"), {
      params: Promise.resolve({ classId: "c1" }),
    });
    expect(res.status).toBe(400);
  });

  it("devolve 404 quando a turma/período não existe pro tenant", async () => {
    getCurrentUser.mockResolvedValue(professor());
    getClassPerformanceData.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/turmas/c1/comparativo?termId=term1"), {
      params: Promise.resolve({ classId: "c1" }),
    });
    expect(res.status).toBe(404);
  });

  it("calcula a média da turma a partir dos alunos com nota (ignora null)", async () => {
    getCurrentUser.mockResolvedValue(professor());
    getClassPerformanceData.mockResolvedValue({
      className: "9A",
      termName: "1º Bimestre",
      allStudents: [
        { studentId: "s1", name: "Ana", average: 8, attendancePct: 90, enrollmentId: "e1" },
        { studentId: "s2", name: "Bruno", average: 6, attendancePct: 80, enrollmentId: "e2" },
        { studentId: "s3", name: "Carlos", average: null, attendancePct: 100, enrollmentId: "e3" },
      ],
    });

    const res = await GET(new NextRequest("http://localhost/api/turmas/c1/comparativo?termId=term1"), {
      params: Promise.resolve({ classId: "c1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.classAverage).toBe(7); // (8+6)/2, Carlos (null) não conta
    expect(body.data.students).toEqual([
      { studentId: "s1", name: "Ana", average: 8 },
      { studentId: "s2", name: "Bruno", average: 6 },
      { studentId: "s3", name: "Carlos", average: null },
    ]);
  });

  it("classAverage é null quando nenhum aluno tem nota lançada", async () => {
    getCurrentUser.mockResolvedValue(professor());
    getClassPerformanceData.mockResolvedValue({
      className: "9A",
      termName: "1º Bimestre",
      allStudents: [{ studentId: "s1", name: "Ana", average: null, attendancePct: 90, enrollmentId: "e1" }],
    });

    const res = await GET(new NextRequest("http://localhost/api/turmas/c1/comparativo?termId=term1"), {
      params: Promise.resolve({ classId: "c1" }),
    });
    const body = await res.json();
    expect(body.data.classAverage).toBeNull();
  });

  it("devolve 403 pra papel sem permissão de escrita", async () => {
    getCurrentUser.mockResolvedValue({ id: "m1", tenantId: "t1", role: "RESPONSAVEL" });
    const res = await GET(new NextRequest("http://localhost/api/turmas/c1/comparativo?termId=term1"), {
      params: Promise.resolve({ classId: "c1" }),
    });
    expect(res.status).toBe(403);
  });
});
