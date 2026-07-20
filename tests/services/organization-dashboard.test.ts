import { beforeEach, describe, expect, it, vi } from "vitest";

const organizationFindUnique = vi.fn();
const tenantFindMany = vi.fn();
const membershipFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique: (...a: unknown[]) => organizationFindUnique(...a) },
    tenant: { findMany: (...a: unknown[]) => tenantFindMany(...a) },
    membership: { findUnique: (...a: unknown[]) => membershipFindUnique(...a) },
  },
}));

const getDashboardReport = vi.fn();
const deriveDashboardSummary = vi.fn();
vi.mock("@/repositories/dashboard-report.repository", () => ({
  getDashboardReport: (...a: unknown[]) => getDashboardReport(...a),
  deriveDashboardSummary: (...a: unknown[]) => deriveDashboardSummary(...a),
}));

import { getOrganizationDashboard } from "@/services/organization.service";

function summary(overrides: Record<string, unknown> = {}) {
  return {
    classAverages: [{ className: "9A", average: 8 }],
    attentionPoints: [],
    metrics: { classCount: 3, studentCount: 60, overallAverage: 7.5, averageAttendancePct: 90 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  organizationFindUnique.mockResolvedValue({ id: "org1", name: "Rede Alpha", ownerId: "u1" });
  getDashboardReport.mockResolvedValue({ classes: [], attentionPoints: [] });
  deriveDashboardSummary.mockReturnValue(summary());
});

describe("getOrganizationDashboard", () => {
  it("devolve 404 quando a organization não existe", async () => {
    organizationFindUnique.mockResolvedValue(null);
    await expect(getOrganizationDashboard("org1", "u1")).rejects.toMatchObject({ status: 404 });
  });

  it("devolve 403 quando o usuário não é o dono", async () => {
    organizationFindUnique.mockResolvedValue({ id: "org1", name: "Rede Alpha", ownerId: "outro-usuario" });
    await expect(getOrganizationDashboard("org1", "u1")).rejects.toMatchObject({ status: 403 });
  });

  it("inclui escola só quando o dono tem Membership ADMIN ATIVA agora — vínculo à Organization não basta", async () => {
    tenantFindMany.mockResolvedValue([{ id: "t1", name: "Escola A" }]);
    membershipFindUnique.mockResolvedValue({ role: "ADMIN", active: true });

    const result = await getOrganizationDashboard("org1", "u1");

    expect(result.schools).toHaveLength(1);
    expect(result.schools[0].tenantName).toBe("Escola A");
    expect(result.excludedSchoolNames).toEqual([]);
  });

  it("exclui escola quando a Membership foi desativada (mesmo com vínculo à Organization ainda existindo)", async () => {
    tenantFindMany.mockResolvedValue([{ id: "t1", name: "Escola A" }]);
    membershipFindUnique.mockResolvedValue({ role: "ADMIN", active: false });

    const result = await getOrganizationDashboard("org1", "u1");

    expect(result.schools).toHaveLength(0);
    expect(result.excludedSchoolNames).toEqual(["Escola A"]);
    expect(getDashboardReport).not.toHaveBeenCalled();
  });

  it("exclui escola quando o papel não é mais ADMIN", async () => {
    tenantFindMany.mockResolvedValue([{ id: "t1", name: "Escola A" }]);
    membershipFindUnique.mockResolvedValue({ role: "PROFESSOR", active: true });

    const result = await getOrganizationDashboard("org1", "u1");
    expect(result.schools).toHaveLength(0);
    expect(result.excludedSchoolNames).toEqual(["Escola A"]);
  });

  it("exclui escola quando não existe Membership nenhuma pro dono ali", async () => {
    tenantFindMany.mockResolvedValue([{ id: "t1", name: "Escola A" }]);
    membershipFindUnique.mockResolvedValue(null);

    const result = await getOrganizationDashboard("org1", "u1");
    expect(result.schools).toHaveLength(0);
    expect(result.excludedSchoolNames).toEqual(["Escola A"]);
  });

  it("calcula classesBelowAverage e studentsLowAttendance a partir do summary/attentionPoints", async () => {
    tenantFindMany.mockResolvedValue([{ id: "t1", name: "Escola A" }]);
    membershipFindUnique.mockResolvedValue({ role: "ADMIN", active: true });
    getDashboardReport.mockResolvedValue({
      classes: [],
      attentionPoints: [
        { studentName: "Ana", className: "9A", reason: "frequência 60%" },
        { studentName: "Ana", className: "9A", reason: "frequência 60%" }, // duplicado — não deve contar 2x
        { studentName: "Bruno", className: "9B", reason: "frequência 50%" },
        { studentName: "Carlos", className: "9A", reason: "média 3.0 em Matemática" }, // não é de frequência
      ],
    });
    deriveDashboardSummary.mockReturnValue(
      summary({ classAverages: [{ className: "9A", average: 3 }, { className: "9B", average: 8 }] })
    );

    const result = await getOrganizationDashboard("org1", "u1");

    expect(result.schools[0].classesBelowAverage).toBe(1); // só 9A (3 < 6)
    expect(result.schools[0].studentsLowAttendance).toBe(2); // Ana (dedupada) + Bruno
  });

  it("agrega múltiplas escolas administradas pelo mesmo dono", async () => {
    tenantFindMany.mockResolvedValue([
      { id: "t1", name: "Escola A" },
      { id: "t2", name: "Escola B" },
    ]);
    membershipFindUnique.mockResolvedValue({ role: "ADMIN", active: true });

    const result = await getOrganizationDashboard("org1", "u1");
    expect(result.schools).toHaveLength(2);
    expect(result.organizationName).toBe("Rede Alpha");
  });
});
