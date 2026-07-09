import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { requireAiAccess } from "@/services/ai/guard";
import { getPerformanceSummary } from "@/services/ai/performance-summary.service";

/**
 * POST /api/ai/performance-summary
 *
 * Recebe classId OU studentId (nunca os dois) + termId, busca os agregados
 * já existentes do dashboard (médias, evolução, frequência) e devolve um
 * resumo em linguagem natural. Cacheado por 24h ou até os dados mudarem
 * (ver services/ai/performance-summary.service.ts).
 */

const bodySchema = z
  .object({
    classId: z.string().min(1).optional(),
    studentId: z.string().min(1).optional(),
    termId: z.string().min(1),
  })
  .refine((v) => Boolean(v.classId) !== Boolean(v.studentId), {
    message: "Informe classId OU studentId (exatamente um dos dois).",
  });

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para gerar resumos de desempenho.");
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.flatten());
  }

  const accessBlock = await requireAiAccess(user.tenantId);
  if (accessBlock) return accessBlock;

  const { classId, studentId, termId } = parsed.data;
  const result = await getPerformanceSummary({
    tenantId: user.tenantId,
    membershipId: user.id,
    scopeType: classId ? "CLASS" : "STUDENT",
    scopeId: (classId ?? studentId) as string,
    termId,
  });

  return apiSuccess(result);
});
