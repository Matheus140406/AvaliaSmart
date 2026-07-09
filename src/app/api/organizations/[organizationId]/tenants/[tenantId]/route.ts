import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/http/api-response";
import { HttpError, unauthorized } from "@/lib/http/errors";
import { unlinkTenantFromOrganization } from "@/services/organization.service";

type RouteContext = { params: Promise<{ organizationId: string; tenantId: string }> };

/** DELETE /api/organizations/[organizationId]/tenants/[tenantId] — desvincula (só o dono). */
export const DELETE = async (request: NextRequest, context: RouteContext): Promise<NextResponse> => {
  try {
    const session = await auth();
    if (!session?.user?.id) throw unauthorized();

    const { organizationId, tenantId } = await context.params;
    const tenant = await unlinkTenantFromOrganization(organizationId, session.user.id, tenantId);
    return apiSuccess({ id: tenant.id, organizationId: tenant.organizationId });
  } catch (err) {
    if (err instanceof HttpError) return apiError(err.message, err.status, err.details);
    // eslint-disable-next-line no-console
    console.error(`[unhandled] ${request.method} ${request.nextUrl.pathname}:`, err);
    return apiError("Erro interno. Tente novamente em instantes.", 500);
  }
};
