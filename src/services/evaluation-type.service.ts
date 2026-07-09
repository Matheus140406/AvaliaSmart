import { badRequest, conflict, notFound } from "@/lib/http/errors";
import {
  listEvaluationTypes,
  findEvaluationTypeById,
  findEvaluationTypeByName,
  nextEvaluationTypeOrder,
  createEvaluationType,
  updateEvaluationType,
  countGradeConfigsUsingType,
  deleteEvaluationType,
} from "@/repositories/evaluation-type.repository";

/**
 * Tipos de avaliação editáveis por tenant (Prova, Trabalho, Seminário...) —
 * antes um enum fixo no código, agora dado por tenant. Regras de negócio
 * simples: nome único por tenant (case-insensitive), não deleta tipo em
 * uso (sugere desativar), desativar só esconde do wizard — não apaga nada.
 */

export function getEvaluationTypes(tenantId: string, includeInactive: boolean) {
  return listEvaluationTypes(tenantId, includeInactive);
}

export async function addEvaluationType(tenantId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw badRequest("Informe o nome do tipo de avaliação.");

  const existing = await findEvaluationTypeByName(tenantId, trimmed);
  if (existing) throw conflict(`Já existe um tipo de avaliação chamado "${trimmed}" neste workspace.`);

  const order = await nextEvaluationTypeOrder(tenantId);
  return createEvaluationType({ tenantId, name: trimmed, order });
}

async function assertBelongsToTenant(id: string, tenantId: string) {
  const option = await findEvaluationTypeById(id);
  if (!option || option.tenantId !== tenantId) {
    throw notFound("Tipo de avaliação não encontrado.");
  }
  return option;
}

export async function renameOrToggleEvaluationType(
  id: string,
  tenantId: string,
  patch: { name?: string; active?: boolean }
) {
  await assertBelongsToTenant(id, tenantId);

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw badRequest("Nome não pode ficar vazio.");
    const existing = await findEvaluationTypeByName(tenantId, trimmed);
    if (existing && existing.id !== id) {
      throw conflict(`Já existe um tipo de avaliação chamado "${trimmed}" neste workspace.`);
    }
    patch = { ...patch, name: trimmed };
  }

  return updateEvaluationType(id, patch);
}

export async function removeEvaluationType(id: string, tenantId: string) {
  await assertBelongsToTenant(id, tenantId);

  const usageCount = await countGradeConfigsUsingType(id);
  if (usageCount > 0) {
    throw conflict(
      `Este tipo já foi usado em ${usageCount} avaliaç${usageCount === 1 ? "ão" : "ões"} — desative em vez de excluir, pra não quebrar o histórico.`
    );
  }

  return deleteEvaluationType(id);
}
