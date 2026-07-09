import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { renameOrToggleEvaluationType, removeEvaluationType } from "@/services/evaluation-type.service";

/**
 * PATCH  /api/evaluation-types/[typeId] — renomeia e/ou ativa/desativa.
 * DELETE /api/evaluation-types/[typeId] — exclui, só se nunca foi usado
 * (ver regra em evaluation-type.service.ts) — senão sugere desativar.
 */

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  active: z.boolean().optional(),
});

export const PATCH = withTenant<{ params: Promise<{ typeId: string }> }>(async (request, user, context) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para gerenciar tipos de avaliação.");
  }
  const { typeId } = await context.params;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.flatten());
  }
  if (parsed.data.name === undefined && parsed.data.active === undefined) {
    throw badRequest("Informe `name` e/ou `active`.");
  }

  const type = await renameOrToggleEvaluationType(typeId, user.tenantId, parsed.data);
  return apiSuccess(type);
});

export const DELETE = withTenant<{ params: Promise<{ typeId: string }> }>(async (_request, user, context) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para gerenciar tipos de avaliação.");
  }
  const { typeId } = await context.params;

  await removeEvaluationType(typeId, user.tenantId);
  return apiSuccess({ id: typeId });
});
