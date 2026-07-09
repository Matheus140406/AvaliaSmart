import type { NextRequest } from "next/server";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { unenrollStudent } from "@/services/enrollment.service";

type RouteContext = { params: Promise<{ classId: string; enrollmentId: string }> };

/** DELETE /api/turmas/[classId]/alunos/[enrollmentId] — desmatricula (soft: `Enrollment.status = "CANCELADA"`, histórico intacto). */
export const DELETE = withTenant<RouteContext>(async (_request: NextRequest, user, context) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para desmatricular alunos.");
  }
  const { classId, enrollmentId } = await context.params;

  const enrollment = await unenrollStudent({ tenantId: user.tenantId, role: user.role, classId, enrollmentId });
  return apiSuccess({ id: enrollment.id, status: enrollment.status });
});
