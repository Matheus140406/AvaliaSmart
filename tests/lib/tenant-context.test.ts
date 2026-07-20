import { describe, expect, it } from "vitest";
import { runWithTenantContext, getTenantContext } from "@/lib/tenant-context";

describe("tenant-context (AsyncLocalStorage)", () => {
  it("expõe o contexto dentro do run, inclusive após await", async () => {
    await runWithTenantContext({ tenantId: "t1", membershipId: "m1" }, async () => {
      expect(getTenantContext()?.tenantId).toBe("t1");
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(getTenantContext()?.tenantId).toBe("t1");
      expect(getTenantContext()?.membershipId).toBe("m1");
    });
  });

  it("é undefined fora de qualquer contexto", () => {
    expect(getTenantContext()).toBeUndefined();
  });

  it("não vaza contexto entre execuções concorrentes", async () => {
    const seen: string[] = [];
    await Promise.all([
      runWithTenantContext({ tenantId: "tenant-A", membershipId: "a" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        seen.push(getTenantContext()!.tenantId);
      }),
      runWithTenantContext({ tenantId: "tenant-B", membershipId: "b" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));
        seen.push(getTenantContext()!.tenantId);
      }),
    ]);
    expect(seen.sort()).toEqual(["tenant-A", "tenant-B"]);
  });
});
