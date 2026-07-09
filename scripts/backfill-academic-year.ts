/**
 * Backfill pra tenants criados ANTES do auto-create de AcademicYear+Terms
 * ter entrado em `POST /api/workspaces` — aqueles continuam sem ano letivo
 * ativo, travados em "Nenhum ano letivo ativo encontrado" ao tentar criar
 * turma. Idempotente: só cria pra tenant que realmente não tem NENHUM
 * AcademicYear com `isActive: true` — rodar de novo não duplica nada.
 *
 * Mesmo padrão exato do auto-create em `src/app/api/workspaces/route.ts`
 * (1 AcademicYear do ano corrente + 4 Terms bimestrais) — script sozinho
 * em vez de reusar o código da rota porque essa é uma operação de
 * manutenção pontual (rodar uma vez por ambiente), não parte do fluxo de
 * requisição normal.
 *
 * Rodar:  npx tsx scripts/backfill-academic-year.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const termNames = ["1º Bimestre", "2º Bimestre", "3º Bimestre", "4º Bimestre"];

async function main() {
  const tenantsWithoutActiveYear = await prisma.tenant.findMany({
    where: { academicYears: { none: { isActive: true } } },
  });

  if (tenantsWithoutActiveYear.length === 0) {
    console.log("Nenhum tenant sem ano letivo ativo — nada a fazer.");
    return;
  }

  console.log(`${tenantsWithoutActiveYear.length} tenant(s) sem ano letivo ativo:`);
  for (const t of tenantsWithoutActiveYear) console.log(`  - ${t.name} (${t.id})`);

  const currentYear = new Date().getFullYear();

  for (const tenant of tenantsWithoutActiveYear) {
    await prisma.$transaction(async (tx) => {
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
    });
    console.log(`✔ ${tenant.name}: AcademicYear ${currentYear} + 4 Terms criados.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
