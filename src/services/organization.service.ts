import { prisma } from "@/lib/prisma";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http/errors";
import { getDashboardReport, deriveDashboardSummary } from "@/repositories/dashboard-report.repository";
import { PASSING_AVERAGE } from "@/types/grade-grid";

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

export interface SchoolDashboardSummary {
  tenantId: string;
  tenantName: string;
  classCount: number;
  studentCount: number;
  overallAverage: number | null;
  averageAttendancePct: number | null;
  classesBelowAverage: number;
  studentsLowAttendance: number;
}

export interface OrganizationDashboard {
  organizationName: string;
  schools: SchoolDashboardSummary[];
  /** Tenants vinculados à Organization mas fora do consolidado — o dono da Organization não tem (ou não tem mais) Membership ADMIN ativa neles. Ver comentário no topo do arquivo: vínculo à Organization NUNCA concede acesso a dado de Tenant. */
  excludedSchoolNames: string[];
}

/**
 * Consolidado cross-escola pro dono de uma Organization (rede de escolas) —
 * gap documentado desde a Etapa de hierarquia ("sem relatório agregado
 * cross-escola nesta versão"). Cada escola só entra no consolidado se o
 * dono da Organization TEM, AGORA, Membership ADMIN ativa nela — vínculo à
 * Organization por si só nunca é suficiente (ver assertOwnsOrganization e o
 * comentário no topo do arquivo). Reaproveita getDashboardReport +
 * deriveDashboardSummary (mesma agregação do painel de uma escola) por
 * escola, sem duplicar cálculo de média/frequência.
 */
export async function getOrganizationDashboard(
  organizationId: string,
  userId: string
): Promise<OrganizationDashboard> {
  const org = await assertOwnsOrganization(organizationId, userId);
  const tenants = await prisma.tenant.findMany({ where: { organizationId }, select: { id: true, name: true } });

  const schools: SchoolDashboardSummary[] = [];
  const excludedSchoolNames: string[] = [];

  for (const tenant of tenants) {
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId: tenant.id } },
    });
    if (!membership || !membership.active || membership.role !== "ADMIN") {
      excludedSchoolNames.push(tenant.name);
      continue;
    }

    const report = await getDashboardReport(tenant.id);
    const summary = deriveDashboardSummary(report);

    const classesBelowAverage = summary.classAverages.filter(
      (c) => c.average !== null && c.average < PASSING_AVERAGE
    ).length;
    const studentsLowAttendance = new Set(
      report.attentionPoints
        .filter((p) => p.reason.startsWith("frequência"))
        .map((p) => `${p.className}:${p.studentName}`)
    ).size;

    schools.push({
      tenantId: tenant.id,
      tenantName: tenant.name,
      classCount: summary.metrics.classCount,
      studentCount: summary.metrics.studentCount,
      overallAverage: summary.metrics.overallAverage,
      averageAttendancePct: summary.metrics.averageAttendancePct,
      classesBelowAverage,
      studentsLowAttendance,
    });
  }

  return { organizationName: org.name, schools, excludedSchoolNames };
}
