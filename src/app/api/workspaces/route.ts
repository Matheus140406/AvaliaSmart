import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findPlanByTier } from "@/repositories/plan.repository";
import { DEFAULT_EVALUATION_TYPE_NAMES } from "@/repositories/evaluation-type.repository";
import { withErrorHandling } from "@/lib/http/error-handler";
import { apiSuccess } from "@/lib/http/api-response";
import { unauthorized, badRequest } from "@/lib/http/errors";

/**
 * POST /api/workspaces — cria o workspace da pessoa logada.
 *
 * Precisa de sessão mas NÃO usa withTenant: o tenant ainda não existe (é
 * exatamente o que está sendo criado). Tenant + Membership ADMIN + trial de
 * 5 dias + AcademicYear (ano corrente) + 4 Terms (bimestres) nascem juntos
 * numa transação — não existe estado intermediário de "workspace sem
 * assinatura" nem "workspace sem ano letivo".
 *
 * O AcademicYear/Terms entraram aqui depois de confirmar (reproduzindo o
 * fluxo real, não só lendo código) que TODO workspace criado por esta rota
 * — ou seja, todo usuário real, fora do tenant do seed — nascia sem
 * nenhum AcademicYear, e `POST /api/turmas` exige um pra criar turma:
 * ninguém conseguia cadastrar turma nenhuma. Datas/quantidade de períodos
 * são um padrão razoável (mesmo usado em `prisma/seed.ts`), não
 * configurável ainda — ajustar isso é uma tela futura, decidida
 * explicitamente como fora do escopo desta rodada.
 */

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Nome precisa de pelo menos 2 caracteres.").max(120),
  type: z.enum(["ESCOLA", "PROFESSOR_AUTONOMO"]),
});

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    throw unauthorized();
  }
  const userId = session.user.id;

  const body = await request.json().catch(() => null);
  const parsed = createWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.flatten());
  }
  const { name, type } = parsed.data;

  // Slug único: base do nome + sufixo aleatório curto (evita corrida em
  // nomes comuns tipo "Escola São José" sem precisar de retry loop).
  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;

  const trialPlan = await findPlanByTier("TESTE_GRATIS");
  const trialEndsAt = new Date(Date.now() + (trialPlan?.durationDays ?? 5) * 24 * 60 * 60 * 1000);

  const currentYear = new Date().getFullYear();
  const termNames = ["1º Bimestre", "2º Bimestre", "3º Bimestre", "4º Bimestre"];

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { name, slug, type },
    });
    const membership = await tx.membership.create({
      data: { userId, tenantId: tenant.id, role: "ADMIN" },
    });
    await tx.subscription.create({
      data: { tenantId: tenant.id, tier: "TESTE_GRATIS", status: "ATIVA", trialEndsAt },
    });

    const academicYear = await tx.academicYear.create({
      data: {
        tenantId: tenant.id,
        year: currentYear,
        startDate: new Date(`${currentYear}-02-01`),
        endDate: new Date(`${currentYear}-12-15`),
        isActive: true,
      },
    });
    for (let i = 0; i < termNames.length; i++) {
      await tx.term.create({
        data: {
          academicYearId: academicYear.id,
          name: termNames[i],
          order: i + 1,
          startDate: new Date(`${currentYear}-0${2 + i * 2}-01`),
          endDate: new Date(`${currentYear}-0${3 + i * 2}-30`),
        },
      });
    }

    // Conjunto padrão de tipos de avaliação, editável depois em
    // /tipos-avaliacao — sem isso, o tenant nasceria sem NENHUM tipo e o
    // wizard "Nova avaliação" ficaria travado (ver DEFAULT_EVALUATION_TYPE_NAMES).
    for (let i = 0; i < DEFAULT_EVALUATION_TYPE_NAMES.length; i++) {
      await tx.evaluationTypeOption.create({
        data: { tenantId: tenant.id, name: DEFAULT_EVALUATION_TYPE_NAMES[i], order: i },
      });
    }

    return { tenant, membership };
  });

  return apiSuccess(
    {
      tenantId: result.tenant.id,
      tenantName: result.tenant.name,
      membershipId: result.membership.id,
      trialEndsAt,
    },
    201
  );
});
