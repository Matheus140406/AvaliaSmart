import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getEvaluationTypes, addEvaluationType } from "@/services/evaluation-type.service";

/**
 * GET  /api/evaluation-types — lista os tipos do tenant ativo (default: só
 * ativos, `?includeInactive=1` traz todos — usado pela tela de gerenciar).
 * POST /api/evaluation-types — cria um novo tipo (ADMIN/COORDENADOR).
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do tipo de avaliação.").max(60),
});

export const GET = withTenant(async (request, user) => {
  const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";
  const types = await getEvaluationTypes(user.tenantId, includeInactive);
  return apiSuccess(types);
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para gerenciar tipos de avaliação.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.flatten());
  }

  const type = await addEvaluationType(user.tenantId, parsed.data.name);
  return apiSuccess(type, 201);
});
