import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { listConversations } from "@/services/ai/chat.service";

/**
 * GET /api/ai/chat/conversations — lista as conversas do professor logado
 * (sidebar do chat), ordenadas pela mais recentemente ativa. Criar uma
 * conversa não tem rota própria: acontece de forma implícita na primeira
 * mensagem enviada sem `conversationId` (ver `sendChatMessage`) — evita
 * conversas "fantasma" vazias na lista antes da pessoa mandar algo.
 */
export const GET = withTenant(async (_request, user) => {
  const conversations = await listConversations(user.tenantId, user.id);
  return apiSuccess(conversations);
});
