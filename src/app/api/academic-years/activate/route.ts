import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { activateAcademicYear } from "@/services/academic-year.service";

/**
 * POST /api/academic-years/activate — ativa (criando se necessário) o ano
 * letivo `year` do tenant. ADMIN-only: isso afeta a estrutura inteira do
 * workspace (qual ano toda turma nova vai pertencer), não é uma ação de
 * professor/coordenador do dia a dia.
 */

const bodySchema = z.object({ year: z.number().int() });

export const POST = withTenant(async (request, user) => {
  if (user.role !== "ADMIN") {
    throw forbidden("Só administradores podem ativar um ano letivo.");
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Informe `year` (número inteiro).");
  }

  const academicYear = await activateAcademicYear(user.tenantId, parsed.data.year);
  return apiSuccess({ id: academicYear.id, year: academicYear.year });
});
