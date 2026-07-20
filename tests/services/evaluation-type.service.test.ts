import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http/errors";

vi.mock("@/repositories/evaluation-type.repository", () => ({
  listEvaluationTypes: vi.fn(),
  findEvaluationTypeById: vi.fn(),
  findEvaluationTypeByName: vi.fn(),
  nextEvaluationTypeOrder: vi.fn(),
  createEvaluationType: vi.fn(),
  updateEvaluationType: vi.fn(),
  countGradeConfigsUsingType: vi.fn(),
  deleteEvaluationType: vi.fn(),
}));

import * as repo from "@/repositories/evaluation-type.repository";
import {
  addEvaluationType,
  renameOrToggleEvaluationType,
  removeEvaluationType,
} from "@/services/evaluation-type.service";

const mocked = vi.mocked(repo);

beforeEach(() => {
  vi.resetAllMocks();
});

async function expectHttpError(promise: Promise<unknown>, status: number): Promise<HttpError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(status);
    return err as HttpError;
  }
  throw new Error(`esperava HttpError ${status}, mas a promise resolveu`);
}

describe("addEvaluationType", () => {
  it("cria com nome trimado e ordem sequencial", async () => {
    mocked.findEvaluationTypeByName.mockResolvedValue(null);
    mocked.nextEvaluationTypeOrder.mockResolvedValue(3);
    mocked.createEvaluationType.mockResolvedValue({ id: "et1" } as never);

    await addEvaluationType("t1", "  Seminário  ");

    expect(mocked.createEvaluationType).toHaveBeenCalledWith({
      tenantId: "t1",
      name: "Seminário",
      order: 3,
    });
  });

  it("rejeita nome vazio com 400", async () => {
    await expectHttpError(addEvaluationType("t1", "   "), 400);
    expect(mocked.createEvaluationType).not.toHaveBeenCalled();
  });

  it("rejeita nome duplicado com 409", async () => {
    mocked.findEvaluationTypeByName.mockResolvedValue({ id: "existente" } as never);
    await expectHttpError(addEvaluationType("t1", "Prova"), 409);
  });
});

describe("renameOrToggleEvaluationType — isolamento de tenant", () => {
  it("devolve 404 quando o registro pertence a OUTRO tenant (não vaza existência)", async () => {
    mocked.findEvaluationTypeById.mockResolvedValue({ id: "et1", tenantId: "tenant-B" } as never);
    await expectHttpError(renameOrToggleEvaluationType("et1", "tenant-A", { active: false }), 404);
    expect(mocked.updateEvaluationType).not.toHaveBeenCalled();
  });

  it("devolve 404 quando o registro não existe", async () => {
    mocked.findEvaluationTypeById.mockResolvedValue(null);
    await expectHttpError(renameOrToggleEvaluationType("nope", "t1", {}), 404);
  });

  it("renomeia com trim e recusa colisão de nome com outro registro", async () => {
    mocked.findEvaluationTypeById.mockResolvedValue({ id: "et1", tenantId: "t1" } as never);
    mocked.findEvaluationTypeByName.mockResolvedValue({ id: "et2" } as never);
    await expectHttpError(renameOrToggleEvaluationType("et1", "t1", { name: "Prova" }), 409);
  });

  it("permite 'renomear' pro próprio nome (mesmo id)", async () => {
    mocked.findEvaluationTypeById.mockResolvedValue({ id: "et1", tenantId: "t1" } as never);
    mocked.findEvaluationTypeByName.mockResolvedValue({ id: "et1" } as never);
    mocked.updateEvaluationType.mockResolvedValue({ id: "et1" } as never);

    await renameOrToggleEvaluationType("et1", "t1", { name: " Prova " });
    expect(mocked.updateEvaluationType).toHaveBeenCalledWith("et1", { name: "Prova" });
  });
});

describe("removeEvaluationType", () => {
  it("recusa exclusão de tipo em uso com 409", async () => {
    mocked.findEvaluationTypeById.mockResolvedValue({ id: "et1", tenantId: "t1" } as never);
    mocked.countGradeConfigsUsingType.mockResolvedValue(2);
    await expectHttpError(removeEvaluationType("et1", "t1"), 409);
    expect(mocked.deleteEvaluationType).not.toHaveBeenCalled();
  });

  it("exclui tipo sem uso", async () => {
    mocked.findEvaluationTypeById.mockResolvedValue({ id: "et1", tenantId: "t1" } as never);
    mocked.countGradeConfigsUsingType.mockResolvedValue(0);
    mocked.deleteEvaluationType.mockResolvedValue({ id: "et1" } as never);

    await removeEvaluationType("et1", "t1");
    expect(mocked.deleteEvaluationType).toHaveBeenCalledWith("et1");
  });
});
