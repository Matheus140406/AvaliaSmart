import { prisma } from "@/lib/prisma";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http/errors";

/**
 * Organization é puramente agrupamento/navegação entre Tenants de um mesmo
 * dono — NÃO é uma camada de permissão. Ser dono da Organization nunca
 * concede acesso aos dados de um Tenant vinculado; isso continua exigindo
 * uma Membership própria, ativa, naquele Tenant específico (ver
 * `withTenant`/`getCurrentUser`, inalterados por este arquivo). Por isso as
 * funções aqui usam `prisma` direto (sem tenant-context) — operam sobre
 * `User`/`Organization`, que são globais, não escopados a um Tenant.
 */

export async function createOrganization(ownerId: string, name: string) {
  return prisma.organization.create({ data: { ownerId, name } });
}

/** Organizations que este usuário é dono, com os Tenants já vinculados. */
export async function listMyOrganizations(ownerId: string) {
  return prisma.organization.findMany({
    where: { ownerId },
    include: { tenants: { select: { id: true, name: true, slug: true, type: true } } },
    orderBy: { createdAt: "asc" },
  });
}

async function assertOwnsOrganization(organizationId: string, userId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) throw notFound("Organization não encontrada.");
  if (org.ownerId !== userId) throw forbidden("Só o dono da Organization pode gerenciar os vínculos.");
  return org;
}

/**
 * Vincula um Tenant existente à Organization. Exige, além de ser dono da
 * Organization, ter Membership ADMIN ativa no Tenant sendo vinculado — sem
 * isso, o dono de uma Organization poderia arrastar pra dentro dela um
 * Tenant de terceiros (school B) sem consentimento de quem administra B.
 * Isso NÃO abre acesso a dado nenhum, mas evita que a estrutura de
 * agrupamento seja montada sem o administrador daquele Tenant concordar.
 */
export async function linkTenantToOrganization(organizationId: string, userId: string, tenantId: string) {
  await assertOwnsOrganization(organizationId, userId);

  const [tenant, membership] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.membership.findUnique({ where: { userId_tenantId: { userId, tenantId } } }),
  ]);
  if (!tenant) throw notFound("Tenant não encontrado.");
  if (!membership || !membership.active || membership.role !== "ADMIN") {
    throw forbidden("Você precisa ser administrador deste workspace para vinculá-lo à Organization.");
  }
  if (tenant.organizationId === organizationId) {
    throw conflict("Este workspace já está vinculado a esta Organization.");
  }
  if (tenant.organizationId) {
    throw conflict("Este workspace já pertence a outra Organization — desvincule-o de lá primeiro.");
  }

  return prisma.tenant.update({ where: { id: tenantId }, data: { organizationId } });
}

export async function unlinkTenantFromOrganization(organizationId: string, userId: string, tenantId: string) {
  await assertOwnsOrganization(organizationId, userId);

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant || tenant.organizationId !== organizationId) {
    throw badRequest("Este workspace não está vinculado a esta Organization.");
  }

  return prisma.tenant.update({ where: { id: tenantId }, data: { organizationId: null } });
}
