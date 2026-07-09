import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/http/api-response";
import { HttpError, unauthorized, badRequest } from "@/lib/http/errors";
import { linkTenantToOrganization } from "@/services/organization.service";

type RouteContext = { params: Promise<{ organizationId: string }> };

const linkTenantSchema = z.object({
  tenantId: z.string().min(1),
});

/**
 * POST /api/organizations/[organizationId]/tenants — vincula um Tenant
 * existente à Organization. Sem withTenant: opera sobre a identidade global
 * do User (dono da Organization), não sobre um Tenant ativo — o Tenant alvo
 * vem no corpo da requisição, checado dentro do service (dono da Organization
 * + ADMIN ativo naquele Tenant, ver organization.service.ts).
 */
export const POST = async (request: NextRequest, context: RouteContext): Promise<NextResponse> => {
  try {
    const session = await auth();
    if (!session?.user?.id) throw unauthorized();

    const { organizationId } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = linkTenantSchema.safeParse(body);
    if (!parsed.success) {
      throw badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.flatten());
    }

    const tenant = await linkTenantToOrganization(organizationId, session.user.id, parsed.data.tenantId);
    return apiSuccess({ id: tenant.id, organizationId: tenant.organizationId });
  } catch (err) {
    if (err instanceof HttpError) return apiError(err.message, err.status, err.details);
    // eslint-disable-next-line no-console
    console.error(`[unhandled] ${request.method} ${request.nextUrl.pathname}:`, err);
    return apiError("Erro interno. Tente novamente em instantes.", 500);
  }
};
