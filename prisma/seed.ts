/**
 * Seed de desenvolvimento — cria um ambiente completo e navegável:
 * 1 escola, 1 usuário (admin+professor), 1 ano letivo com 4 bimestres,
 * 1 turma com 2 disciplinas, 8 alunos matriculados, avaliações configuradas
 * e algumas notas de exemplo.
 *
 * Rodar:  npx prisma db seed
 * (requer o bloco "prisma": { "seed": "tsx prisma/seed.ts" } no package.json
 *  e `npm i -D tsx`)
 *
 * Login após o seed:  admin@demo.com / senha123
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Limpando dados de demonstração anteriores (tenant 'escola-demo')...");
  await prisma.tenant.deleteMany({ where: { slug: "escola-demo" } });
  await prisma.user.deleteMany({ where: { email: "admin@demo.com" } });

  console.log("Criando tenant e usuário...");
  const tenant = await prisma.tenant.create({
    data: { name: "Escola Demo", slug: "escola-demo", type: "ESCOLA" },
  });

  const evaluationTypeNames = ["Prova", "Trabalho", "Participação", "Projeto", "Recuperação", "Diagnóstica", "Seminário", "Outro"];
  const evaluationTypes = await Promise.all(
    evaluationTypeNames.map((name, order) =>
      prisma.evaluationTypeOption.create({ data: { tenantId: tenant.id, name, order } })
    )
  );
  const provaTypeId = evaluationTypes.find((t) => t.name === "Prova")!.id;

  const user = await prisma.user.create({
    data: {
      name: "Professor Demo",
      email: "admin@demo.com",
      passwordHash: await bcrypt.hash("senha123", 10),
    },
  });

  const membership = await prisma.membership.create({
    data: { userId: user.id, tenantId: tenant.id, role: "ADMIN" },
  });

  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      tier: "TESTE_GRATIS",
      status: "ATIVA",
      trialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("Criando estrutura acadêmica...");
  const year = await prisma.academicYear.create({
    data: {
      tenantId: tenant.id,
      year: new Date().getFullYear(),
      startDate: new Date(`${new Date().getFullYear()}-02-01`),
      endDate: new Date(`${new Date().getFullYear()}-12-15`),
    },
  });

  const termNames = ["1º Bimestre", "2º Bimestre", "3º Bimestre", "4º Bimestre"];
  const terms = [];
  for (let i = 0; i < termNames.length; i++) {
    terms.push(
      await prisma.term.create({
        data: {
          academicYearId: year.id,
          name: termNames[i],
          order: i + 1,
          startDate: new Date(`${new Date().getFullYear()}-0${2 + i * 2}-01`),
          endDate: new Date(`${new Date().getFullYear()}-0${3 + i * 2}-30`),
        },
      })
    );
  }

  const turma = await prisma.class.create({
    data: { tenantId: tenant.id, academicYearId: year.id, name: "9º Ano A", gradeLevel: "9º Ano", shift: "Manhã" },
  });

  const [matematica, portugues] = await Promise.all([
    prisma.subject.create({ data: { tenantId: tenant.id, name: "Matemática" } }),
    prisma.subject.create({ data: { tenantId: tenant.id, name: "Língua Portuguesa" } }),
  ]);

  const [csMat, csPort] = await Promise.all([
    prisma.classSubject.create({
      data: { classId: turma.id, subjectId: matematica.id, teacherId: membership.id },
    }),
    prisma.classSubject.create({
      data: { classId: turma.id, subjectId: portugues.id, teacherId: membership.id },
    }),
  ]);

  console.log("Criando avaliações (GradeConfig) do 1º Bimestre...");
  const term1 = terms[0];
  const configs = await Promise.all(
    [
      { classSubjectId: csMat.id, name: "Prova 1", weight: 2, order: 0 },
      { classSubjectId: csMat.id, name: "Trabalho", weight: 1, order: 1 },
      { classSubjectId: csMat.id, name: "Prova 2", weight: 2, order: 2 },
      { classSubjectId: csPort.id, name: "Prova 1", weight: 2, order: 0 },
      { classSubjectId: csPort.id, name: "Redação", weight: 1, order: 1 },
    ].map((c) =>
      prisma.gradeConfig.create({
        data: { ...c, termId: term1.id, typeId: provaTypeId, maxScore: 10 },
      })
    )
  );

  console.log("Criando alunos e matrículas...");
  const studentNames = [
    "Ana Beatriz Souza",
    "Bruno Ferreira Lima",
    "Carla Mendes Oliveira",
    "Diego Santos Rocha",
    "Eduarda Costa Alves",
    "Felipe Nascimento Dias",
    "Gabriela Pereira Nunes",
    "Henrique Barbosa Melo",
  ];

  const enrollments = [];
  for (let i = 0; i < studentNames.length; i++) {
    const student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        name: studentNames[i],
        registrationCode: `2026${String(i + 1).padStart(3, "0")}`,
      },
    });
    enrollments.push(
      await prisma.enrollment.create({
        data: { studentId: student.id, classId: turma.id, academicYearId: year.id },
      })
    );
  }

  console.log("Lançando notas de exemplo (variadas de propósito: aprovado/recuperação/reprovado/pendente)...");
  const matConfigs = configs.filter((c) => c.classSubjectId === csMat.id);
  for (let i = 0; i < enrollments.length; i++) {
    // Perfis: alunos 0-3 bem, 4-5 recuperação, 6 reprovado, 7 sem nota (pendente)
    const base = i <= 3 ? 7.5 : i <= 5 ? 5 : i === 6 ? 3 : null;
    if (base === null) continue;
    for (const gc of matConfigs) {
      await prisma.grade.create({
        data: {
          enrollmentId: enrollments[i].id,
          gradeConfigId: gc.id,
          termId: term1.id,
          value: Math.min(10, Math.max(0, base + (Math.random() * 2 - 1))),
          updatedById: membership.id,
        },
      });
    }
  }

  console.log("\nSeed concluído.");
  console.log("Login: admin@demo.com / senha123");
  console.log(`Grid de Matemática: /turmas/${turma.id}/notas/${matematica.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
