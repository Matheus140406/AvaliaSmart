import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http/errors";

vi.mock("@/repositories/observation-template.repository", () => ({
  listObservationTemplates: vi.fn(),
  createObservationTemplate: vi.fn(),
  findObservationTemplateById: vi.fn(),
  deleteObservationTemplate: vi.fn(),
}));

import * as repo from "@/repositories/observation-template.repository";
import { addObservationTemplate, removeObservationTemplate } from "@/services/observation-template.service";

const mocked = vi.mocked(repo);

beforeEach(() => {
  vi.resetAllMocks();
});

async function expectHttpError(promise: Promise<unknown>, status: number) {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(status);
    return;
  }
  throw new Error(`esperava HttpError ${status}`);
}

describe("addObservationTemplate", () => {
  it("salva com o texto trimado", async () => {
    mocked.createObservationTemplate.mockResolvedValue({ id: "o1" } as never);
    await addObservationTemplate("t1", "m1", "  Boa participação em aula.  ");
    expect(mocked.createObservationTemplate).toHaveBeenCalledWith({
      tenantId: "t1",
      membershipId: "m1",
      text: "Boa participação em aula.",
    });
  });

  it("rejeita texto vazio com 400", async () => {
    await expectHttpError(addObservationTemplate("t1", "m1", "   "), 400);
    expect(mocked.createObservationTemplate).not.toHaveBeenCalled();
  });

  it("rejeita texto acima de 1000 caracteres com 400", async () => {
    await expectHttpError(addObservationTemplate("t1", "m1", "a".repeat(1001)), 400);
  });
});

describe("removeObservationTemplate — isolamento de tenant", () => {
  it("devolve 404 quando o registro pertence a OUTRO tenant", async () => {
    mocked.findObservationTemplateById.mockResolvedValue({ id: "o1", tenantId: "tenant-B" } as never);
    await expectHttpError(removeObservationTemplate("tenant-A", "o1"), 404);
    expect(mocked.deleteObservationTemplate).not.toHaveBeenCalled();
  });

  it("devolve 404 quando o registro não existe", async () => {
    mocked.findObservationTemplateById.mockResolvedValue(null);
    await expectHttpError(removeObservationTemplate("t1", "nope"), 404);
  });

  it("exclui quando pertence ao tenant certo", async () => {
    mocked.findObservationTemplateById.mockResolvedValue({ id: "o1", tenantId: "t1" } as never);
    mocked.deleteObservationTemplate.mockResolvedValue({ id: "o1" } as never);
    await removeObservationTemplate("t1", "o1");
    expect(mocked.deleteObservationTemplate).toHaveBeenCalledWith("o1");
  });
});
