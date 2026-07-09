import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { forbidden } from "@/lib/http/errors";
import { listReceiptsForTenant } from "@/services/billing/receipt.service";

/** GET /api/billing/receipts — lista os comprovantes de pagamento do tenant (ADMIN). */
export const GET = withTenant(async (_request, user) => {
  if (user.role !== "ADMIN") {
    throw forbidden("Só administradores podem ver os comprovantes de pagamento.");
  }
  const receipts = await listReceiptsForTenant(user.tenantId);
  return apiSuccess(
    receipts.map((r) => ({
      id: r.id,
      gateway: r.gateway,
      planName: r.planName,
      amountCents: r.amountCents,
      paidAt: r.paidAt,
    }))
  );
});
