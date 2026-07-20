import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { requireAiAccess } from "@/services/ai/guard";
import { generateParentCommunication } from "@/services/ai/parent-communication.service";

/**
 * POST /api/ai/parent-communication
 *
 * Gera um rascunho de comunicado pra pais/responsáveis (reunião, aviso,
 * recado pontual) — escopo turma inteira ou aluno específico. A IA nunca
 * envia nada sozinha; o professor revisa e envia (e-mail/WhatsApp) pelo
 * frontend.
 */

const bodySchema = z.object({
  scopeType: z.enum(["CLASS", "STUDENT"]),
  scopeId: z.string().min(1),
  context: z.string().min(5).max(1000),
  tone: z.enum(["formal", "informal"]).default("formal"),
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para gerar comunicados.");
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  const accessBlock = await requireAiAccess(user.tenantId);
  if (accessBlock) return accessBlock;

  const result = await generateParentCommunication({
    tenantId: user.tenantId,
    membershipId: user.id,
    scopeType: parsed.data.scopeType,
    scopeId: parsed.data.scopeId,
    context: parsed.data.context,
    tone: parsed.data.tone,
  });

  return apiSuccess(result, 201);
});
