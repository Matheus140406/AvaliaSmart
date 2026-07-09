import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest } from "@/lib/http/errors";
import { submitObservationFeedback } from "@/services/ai/observation-suggestion.service";

type RouteContext = { params: Promise<{ suggestionId: string }> };

const bodySchema = z.object({ feedback: z.enum(["POSITIVO", "NEGATIVO"]) });

/** POST /api/ai/observation-suggestions/[suggestionId]/feedback — 👍/👎 do professor. */
export const POST = withTenant<RouteContext>(async (request, user, context) => {
  const { suggestionId } = await context.params;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido — feedback deve ser POSITIVO ou NEGATIVO.");
  }

  const updated = await submitObservationFeedback({
    tenantId: user.tenantId,
    suggestionId,
    feedback: parsed.data.feedback,
  });

  return apiSuccess({ id: updated.id, feedback: updated.feedback });
});
