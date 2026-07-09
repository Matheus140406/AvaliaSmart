import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { requireAiAccess } from "@/services/ai/guard";
import { createObservationSuggestions } from "@/services/ai/observation-suggestion.service";

/**
 * POST /api/ai/observation-suggestions
 *
 * Gera 2-3 sugestões de observação de boletim pra um aluno + período.
 * A IA nunca escreve direto no boletim — o professor aceita, edita ou
 * descarta (essa decisão vive no frontend, não aqui).
 */

const bodySchema = z.object({
  studentId: z.string().min(1),
  termId: z.string().min(1),
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para gerar sugestões de observação.");
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  const accessBlock = await requireAiAccess(user.tenantId);
  if (accessBlock) return accessBlock;

  const result = await createObservationSuggestions({
    tenantId: user.tenantId,
    membershipId: user.id,
    studentId: parsed.data.studentId,
    termId: parsed.data.termId,
  });

  return apiSuccess(result, 201);
});
