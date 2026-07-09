import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { withErrorHandling } from "@/lib/http/error-handler";
import { apiSuccess } from "@/lib/http/api-response";
import { unauthorized, badRequest } from "@/lib/http/errors";
import { createOrganization, listMyOrganizations } from "@/services/organization.service";

/**
 * POST /api/organizations — cria uma Organization (rede/grupo de escolas)
 * pro usuário logado. GET lista as que ele é dono, com os Tenants já
 * vinculados a cada uma.
 *
 * Sem withTenant, igual `/api/workspaces`: Organization é global ao User,
 * não escopada a um Tenant ativo.
 */

const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Nome precisa de pelo menos 2 caracteres.").max(120),
});

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) throw unauthorized();

  const body = await request.json().catch(() => null);
  const parsed = createOrganizationSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.flatten());
  }

  const org = await createOrganization(session.user.id, parsed.data.name);
  return apiSuccess({ id: org.id, name: org.name }, 201);
});

export const GET = withErrorHandling(async () => {
  const session = await auth();
  if (!session?.user?.id) throw unauthorized();

  const orgs = await listMyOrganizations(session.user.id);
  return apiSuccess(
    orgs.map((o) => ({
      id: o.id,
      name: o.name,
      tenants: o.tenants,
    }))
  );
});
