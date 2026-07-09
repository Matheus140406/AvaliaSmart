import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest } from "@/lib/http/errors";
import { deleteChatMessage, editChatMessage } from "@/services/ai/chat.service";

type RouteContext = { params: Promise<{ messageId: string }> };

/** DELETE /api/ai/chat/messages/[messageId] — apaga uma mensagem avulsa (ação de lixeira por mensagem). */
export const DELETE = withTenant<RouteContext>(async (_request, user, context) => {
  const { messageId } = await context.params;
  await deleteChatMessage(user.tenantId, user.id, messageId);
  return apiSuccess({ id: messageId });
});

const editBodySchema = z.object({
  message: z.string().trim().min(1).max(500),
});

/**
 * PUT /api/ai/chat/messages/[messageId] — "editar e reenviar": só vale
 * pra mensagem do USUÁRIO (ver editChatMessage), trunca a conversa a
 * partir dali e gera uma resposta nova.
 */
export const PUT = withTenant<RouteContext>(async (request, user, context) => {
  const { messageId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = editBodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  const result = await editChatMessage({
    tenantId: user.tenantId,
    membershipId: user.id,
    messageId,
    newMessage: parsed.data.message,
  });
  return apiSuccess(result);
});
