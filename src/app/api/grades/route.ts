import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getGradeGrid, saveGrade } from "@/services/grade.service";

/**
 * GET  /api/grades?classSubjectId=...&termId=...
 *   Hidrata a GradeGrid: alunos matriculados na turma, avaliações configuradas
 *   (GradeConfig) para aquele bimestre/trimestre, e as notas já lançadas.
 *
 * POST /api/grades
 *   Endpoint chamado pela prop `onSaveGrade` da GradeGrid a cada auto-save
 *   (debounce de 500ms no client). Faz upsert por [enrollmentId, gradeConfigId].
 *
 * Ambas usam `withTenant`, que resolve a sessão uma vez e entra no contexto
 * do AsyncLocalStorage (ver lib/tenant-context.ts) — aqui não muda o
 * comportamento na prática, já que ClassSubject/GradeConfig/Enrollment são
 * escopados via relação, não por tenantId direto, mas mantém o padrão
 * consistente com o resto das rotas autenticadas.
 *
 * Regras de negócio (checagem de tenant/professor, validação de nota máxima,
 * upsert) vivem em services/grade.service.ts + repositories/grade.repository.ts.
 */

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

const getQuerySchema = z.object({
  classSubjectId: z.string().min(1, "classSubjectId é obrigatório."),
  termId: z.string().min(1, "termId é obrigatório."),
});

export const GET = withTenant(async (request: NextRequest, user) => {
  const { searchParams } = new URL(request.url);
  const parsedQuery = getQuerySchema.safeParse({
    classSubjectId: searchParams.get("classSubjectId"),
    termId: searchParams.get("termId"),
  });
  if (!parsedQuery.success) {
    throw badRequest("Parâmetros inválidos.", parsedQuery.error.flatten());
  }
  const { classSubjectId, termId } = parsedQuery.data;

  const grid = await getGradeGrid({
    tenantId: user.tenantId,
    role: user.role,
    membershipId: user.id,
    classSubjectId,
    termId,
  });

  return apiSuccess(grid);
});

// ---------------------------------------------------------------------------
// POST (auto-save)
// ---------------------------------------------------------------------------

const saveGradeSchema = z.object({
  enrollmentId: z.string().min(1),
  gradeConfigId: z.string().min(1),
  value: z.number().min(0).nullable(),
});

export const POST = withTenant(async (request: NextRequest, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para lançar notas.");
  }

  const body = await request.json().catch(() => null);
  const parsed = saveGradeSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  const grade = await saveGrade({
    tenantId: user.tenantId,
    role: user.role,
    membershipId: user.id,
    ...parsed.data,
  });

  return apiSuccess(grade);
});
