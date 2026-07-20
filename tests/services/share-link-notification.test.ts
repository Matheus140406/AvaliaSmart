import { beforeEach, describe, expect, it, vi } from "vitest";

const exportShareLinkCreate = vi.fn();
const enrollmentFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    exportShareLink: { create: (...a: unknown[]) => exportShareLinkCreate(...a) },
    enrollment: { findUnique: (...a: unknown[]) => enrollmentFindUnique(...a) },
  },
}));

const dispatchNotification = vi.fn();
vi.mock("@/services/notification.service", () => ({
  dispatchNotification: (...a: unknown[]) => dispatchNotification(...a),
}));

import { createExportShareLink } from "@/services/export/share-link.service";

function enrollmentWithGuardians(guardianEmails: (string | null)[]) {
  return {
    studentId: "s1",
    student: {
      name: "Ana",
      guardians: guardianEmails.map((email, i) => ({ guardian: { id: `g${i}`, email } })),
    },
    class: { name: "9A" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  exportShareLinkCreate.mockResolvedValue({});
  dispatchNotification.mockResolvedValue({ sent: false, reason: "no-template" });
});

describe("createExportShareLink — trigger BOLETIM_DISPONIVEL", () => {
  it("não tenta notificar quando o kind não é boletim-portal", async () => {
    await createExportShareLink("t1", "boletim-pdf", { enrollmentId: "e1" }, "https://app.com");
    expect(enrollmentFindUnique).not.toHaveBeenCalled();
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  it("não tenta notificar quando origin não é passado", async () => {
    await createExportShareLink("t1", "boletim-portal", { enrollmentId: "e1" });
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  it("notifica todos os responsáveis com e-mail cadastrado, ignorando os sem e-mail", async () => {
    enrollmentFindUnique.mockResolvedValue(enrollmentWithGuardians(["mae@x.com", null, "pai@x.com"]));

    await createExportShareLink("t1", "boletim-portal", { enrollmentId: "e1" }, "https://app.com");

    expect(dispatchNotification).toHaveBeenCalledTimes(2);
    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", trigger: "BOLETIM_DISPONIVEL", to: "mae@x.com", studentId: "s1" })
    );
    expect(dispatchNotification).toHaveBeenCalledWith(expect.objectContaining({ to: "pai@x.com" }));
  });

  it("inclui a URL completa do link nas vars da notificação", async () => {
    enrollmentFindUnique.mockResolvedValue(enrollmentWithGuardians(["mae@x.com"]));
    await createExportShareLink("t1", "boletim-portal", { enrollmentId: "e1" }, "https://app.com");

    const call = dispatchNotification.mock.calls[0][0];
    expect(call.vars.link).toMatch(/^https:\/\/app\.com\/api\/export\/download\//);
  });

  it("não quebra a criação do link se a notificação falhar (best-effort)", async () => {
    enrollmentFindUnique.mockRejectedValue(new Error("db fora"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await createExportShareLink("t1", "boletim-portal", { enrollmentId: "e1" }, "https://app.com");

    expect(result.token).toBeDefined();
    spy.mockRestore();
  });

  it("não notifica ninguém quando o aluno não tem responsável cadastrado", async () => {
    enrollmentFindUnique.mockResolvedValue(enrollmentWithGuardians([]));
    await createExportShareLink("t1", "boletim-portal", { enrollmentId: "e1" }, "https://app.com");
    expect(dispatchNotification).not.toHaveBeenCalled();
  });
});
