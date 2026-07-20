import { badRequest, notFound } from "@/lib/http/errors";
import {
  listObservationTemplates,
  createObservationTemplate,
  findObservationTemplateById,
  deleteObservationTemplate,
} from "@/repositories/observation-template.repository";

/**
 * Banco de observações reutilizáveis — o professor salva uma observação de
 * boletim (escrita à mão ou uma das sugestões geradas pela IA em
 * observation-suggestion.service.ts) como "modelo" e reusa depois em
 * alunos parecidos. Desacoplado da sugestão original de propósito: o texto
 * salvo aqui é livre, não referencia mais studentId/termId nenhum.
 */

const MAX_TEXT_LENGTH = 1000;

export function getObservationTemplates(tenantId: string) {
  return listObservationTemplates(tenantId);
}

export async function addObservationTemplate(tenantId: string, membershipId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) throw badRequest("Informe o texto da observação.");
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw badRequest(`Observação muito longa — máximo de ${MAX_TEXT_LENGTH} caracteres.`);
  }
  return createObservationTemplate({ tenantId, membershipId, text: trimmed });
}

export async function removeObservationTemplate(tenantId: string, id: string) {
  const template = await findObservationTemplateById(id);
  if (!template || template.tenantId !== tenantId) {
    throw notFound("Observação não encontrada.");
  }
  return deleteObservationTemplate(id);
}
