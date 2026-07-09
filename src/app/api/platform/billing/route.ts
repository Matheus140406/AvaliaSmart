import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { listTenantsBillingStatus } from "@/services/platform-billing.service";
import { apiSuccess, apiError } from "@/lib/http/api-response";

/**
 * GET /api/platform/billing — visão cross-tenant Adimplente/Inadimplente
 * (Etapa 7). Gate por `PLATFORM_ADMIN_EMAILS` (ver lib/platform-admin.ts),
 * não por Membership — isto não é uma feature de tenant.
 */
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!isPlatformAdmin(session?.user?.email)) {
    return apiError("Não autorizado.", 403);
  }

  const rows = await listTenantsBillingStatus();
  return apiSuccess(rows);
}
