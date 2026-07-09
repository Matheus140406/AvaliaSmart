import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { deleteConversation } from "@/services/ai/chat.service";

type RouteContext = { params: Promise<{ conversationId: string }> };

/** DELETE /api/ai/chat/conversations/[conversationId] — apaga a conversa inteira (cascade nas mensagens). */
export const DELETE = withTenant<RouteContext>(async (_request, user, context) => {
  const { conversationId } = await context.params;
  await deleteConversation(user.tenantId, user.id, conversationId);
  return apiSuccess({ id: conversationId });
});
