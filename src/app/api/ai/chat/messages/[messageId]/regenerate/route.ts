import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { regenerateResponse } from "@/services/ai/chat.service";

type RouteContext = { params: Promise<{ messageId: string }> };

/** POST /api/ai/chat/messages/[messageId]/regenerate — refaz a resposta da IA pra mesma pergunta. */
export const POST = withTenant<RouteContext>(async (_request, user, context) => {
  const { messageId } = await context.params;
  const result = await regenerateResponse(user.tenantId, user.id, messageId);
  return apiSuccess(result);
});
