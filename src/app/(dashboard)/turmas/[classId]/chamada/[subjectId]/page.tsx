import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { AttendanceSheet } from "@/components/attendance/AttendanceSheet";

interface PageProps {
  params: Promise<{ classId: string; subjectId: string }>;
}

/**
 * `/turmas/[classId]/chamada/[subjectId]` — não existia NENHUM fluxo de
 * lançar chamada até esta rodada (o model `Attendance` já existia no
 * schema, só era escrito pelo seed/import de notas). Mesmo padrão de URL
 * de `notas/[subjectId]`, mesma checagem de tenant/professor.
 */
export default async function ChamadaPage({ params }: PageProps) {
  const { classId, subjectId } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();

  const classSubject = await prisma.classSubject.findFirst({
    where: { classId, subjectId, class: { tenantId: user.tenantId } },
    include: { subject: true, class: true },
  });
  if (!classSubject) notFound();

  return (
    <div className="p-6">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-[var(--color-foreground-muted)]" aria-label="Breadcrumb">
        <Link href="/turmas" className="hover:text-brand hover:underline">
          Turmas
        </Link>
        <span>/</span>
        <span>{classSubject.class.name}</span>
        <span>/</span>
        <span className="text-[var(--color-foreground)]">Chamada · {classSubject.subject.name}</span>
      </nav>

      <div className="mb-4">
        <h1 className="text-lg font-semibold text-[var(--color-foreground)]">
          Chamada — {classSubject.subject.name} · {classSubject.class.name}
        </h1>
        <p className="text-sm text-[var(--color-foreground-muted)]">
          Marque presença/falta por data. Salva automaticamente a cada alteração.
        </p>
      </div>

      <AttendanceSheet classId={classId} classSubjectId={classSubject.id} />
    </div>
  );
}
