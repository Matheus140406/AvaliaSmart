import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { toGradeConfigDTO } from "@/lib/grades/serialize";
import ImportWizard from "@/components/import/ImportWizard";

interface PageProps {
  searchParams: Promise<{ classId?: string; classSubjectId?: string; termId?: string }>;
}

export default async function ImportarPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) notFound(); // middleware já redireciona pra /login antes disso na prática

  // Next.js 16: searchParams é uma Promise — antes acessado como objeto
  // síncrono, o que gerava aviso em toda requisição (mesmo problema já
  // corrigido em turmas/[classId]/notas/[subjectId]/page.tsx).
  const { classId, classSubjectId, termId } = await searchParams;
  if (!classId || !classSubjectId || !termId) {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--color-foreground-muted)]">
          Selecione uma turma, disciplina e período pra importar notas — acesse esta página a
          partir da tela de lançamento de notas daquela turma.
        </p>
      </div>
    );
  }

  const classSubject = await prisma.classSubject.findUnique({
    where: { id: classSubjectId },
    include: { class: true, subject: true },
  });
  if (
    !classSubject ||
    classSubject.class.tenantId !== user.tenantId ||
    classSubject.classId !== classId
  ) {
    notFound();
  }
  if (user.role === "PROFESSOR" && classSubject.teacherId !== user.id) {
    notFound();
  }

  const gradeConfigs = await prisma.gradeConfig.findMany({
    where: { classSubjectId, termId },
    include: { type: true },
    orderBy: { order: "asc" },
  });

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-[var(--color-foreground)]">
          Importar notas — {classSubject.subject.name} · {classSubject.class.name}
        </h1>
        <p className="text-sm text-[var(--color-foreground-muted)]">
          Envie uma planilha (.xlsx, .csv ou .ods) com os alunos e notas dessa turma.
        </p>
      </div>

      <ImportWizard
        context={{
          classId,
          classSubjectId,
          termId,
          gradeConfigs: gradeConfigs.map(toGradeConfigDTO),
        }}
      />
    </div>
  );
}
