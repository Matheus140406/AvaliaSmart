import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { commitImport } from "@/services/import.service";

/**
 * POST /api/import/commit — v2 desta rota, ver histórico de decisões em
 * services/import.service.ts + repositories/import.repository.ts:
 * idempotência real (unique constraint em ImportHistory), bulk de verdade
 * (pré-carrega e escreve em lotes) e audit log por commit bem-sucedido.
 */

const mappedRowSchema = z.object({
  rowIndex: z.number(),
  studentName: z.string().nullable(),
  registrationCode: z.string().nullable(),
  grades: z.record(z.string(), z.number().nullable()),
});

const commitSchema = z.object({
  classId: z.string().min(1),
  classSubjectId: z.string().min(1),
  termId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  fileName: z.string().optional(),
  rows: z.array(mappedRowSchema).min(1),
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para importar notas.");
  }

  const body = await request.json().catch(() => null);
  const parsed = commitSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  const result = await commitImport({
    tenantId: user.tenantId,
    membershipId: user.id,
    role: user.role,
    ...parsed.data,
  });

  if (result instanceof NextResponse) return result;
  return apiSuccess(result);
});
