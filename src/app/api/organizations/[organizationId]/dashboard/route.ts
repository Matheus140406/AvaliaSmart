import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { apiSuccess, apiError } from "@/lib/http/api-response";
import { HttpError, unauthorized } from "@/lib/http/errors";
import { getOrganizationDashboard } from "@/services/organization.service";

type RouteContext = { params: Promise<{ organizationId: string }> };

/**
 * GET /api/organizations/[organizationId]/dashboard — consolidado cross-
 * escola pro dono da Organization. Sem withTenant (mesmo motivo do endpoint
 * de vincular Tenant): opera sobre a identidade global do User, não sobre
 * um Tenant ativo — o isolamento por escola é feito dentro do service
 * (só entra no consolidado quem o dono tem Membership ADMIN ativa agora).
 */
export const GET = async (request: NextRequest, context: RouteContext): Promise<NextResponse> => {
  try {
    const session = await auth();
    if (!session?.user?.id) throw unauthorized();

    const { organizationId } = await context.params;
    const dashboard = await getOrganizationDashboard(organizationId, session.user.id);
    return apiSuccess(dashboard);
  } catch (err) {
    if (err instanceof HttpError) return apiError(err.message, err.status, err.details);
    // eslint-disable-next-line no-console
    console.error(`[unhandled] ${request.method} ${request.nextUrl.pathname}:`, err);
    return apiError("Erro interno. Tente novamente em instantes.", 500);
  }
};
