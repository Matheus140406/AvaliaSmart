import { beforeEach, describe, expect, it, vi } from "vitest";

const exportShareLinkCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    exportShareLink: { create: (...a: unknown[]) => exportShareLinkCreate(...a) },
  },
}));

import { createExportShareLink } from "@/services/export/share-link.service";

beforeEach(() => {
  vi.clearAllMocks();
  exportShareLinkCreate.mockResolvedValue({});
});

describe("createExportShareLink", () => {
  it("exige enrollmentId pra boletim-portal", async () => {
    await expect(createExportShareLink("t1", "boletim-portal", {})).rejects.toMatchObject({ status: 400 });
    expect(exportShareLinkCreate).not.toHaveBeenCalled();
  });

  it("boletim-portal dura 90 dias — bem mais que o padrão de 15 minutos", async () => {
    const before = Date.now();
    const { expiresAt } = await createExportShareLink("t1", "boletim-portal", { enrollmentId: "e1" });
    const durationMs = expiresAt.getTime() - before;

    expect(durationMs).toBeGreaterThan(89 * 24 * 60 * 60 * 1000);
    expect(durationMs).toBeLessThanOrEqual(90 * 24 * 60 * 60 * 1000 + 5000);
  });

  it("boletim-pdf continua com o TTL padrão de 15 minutos (comportamento preservado)", async () => {
    const before = Date.now();
    const { expiresAt } = await createExportShareLink("t1", "boletim-pdf", { enrollmentId: "e1" });
    const durationMs = expiresAt.getTime() - before;

    expect(durationMs).toBeGreaterThan(14 * 60 * 1000);
    expect(durationMs).toBeLessThanOrEqual(15 * 60 * 1000 + 2000);
  });

  it("gera token com entropia alta (24 bytes -> string base64url, sem colidir em amostras)", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createExportShareLink("t1", "dashboard-pdf", {}))
    );
    const tokens = exportShareLinkCreate.mock.calls.map((call) => call[0].data.token);
    expect(new Set(tokens).size).toBe(5);
    expect(results).toHaveLength(5);
  });

  it("persiste o kind e os params corretos no ExportShareLink", async () => {
    await createExportShareLink("t1", "boletim-portal", { enrollmentId: "e1" });
    expect(exportShareLinkCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "t1", kind: "boletim-portal", params: { enrollmentId: "e1" } }),
    });
  });
});
