import type { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { getAttendanceSheet, saveAttendance } from "@/services/attendance.service";

/**
 * GET  /api/attendance?classSubjectId=...&date=YYYY-MM-DD
 *   Hidrata a lista de chamada: alunos matriculados na turma + presença já
 *   lançada pra essa data (ou default presente/não-lançado).
 *
 * POST /api/attendance
 *   Auto-save por aluno (debounce no client, mesmo padrão de /api/grades) —
 *   upsert por [enrollmentId, classSubjectId, date].
 */

const getQuerySchema = z.object({
  classSubjectId: z.string().min(1, "classSubjectId é obrigatório."),
  date: z.string().min(1, "date é obrigatório."),
});

export const GET = withTenant(async (request: NextRequest, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para ver a lista de chamada.");
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = getQuerySchema.safeParse({
    classSubjectId: searchParams.get("classSubjectId"),
    date: searchParams.get("date"),
  });
  if (!parsedQuery.success) {
    throw badRequest("Parâmetros inválidos.", parsedQuery.error.flatten());
  }

  const sheet = await getAttendanceSheet({
    tenantId: user.tenantId,
    role: user.role,
    membershipId: user.id,
    ...parsedQuery.data,
  });

  return apiSuccess(sheet);
});

const saveAttendanceSchema = z.object({
  enrollmentId: z.string().min(1),
  classSubjectId: z.string().min(1),
  date: z.string().min(1),
  present: z.boolean(),
  justified: z.boolean(),
});

export const POST = withTenant(async (request: NextRequest, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para lançar chamada.");
  }

  const body = await request.json().catch(() => null);
  const parsed = saveAttendanceSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  const attendance = await saveAttendance({
    tenantId: user.tenantId,
    role: user.role,
    membershipId: user.id,
    ...parsed.data,
  });

  return apiSuccess(attendance);
});
