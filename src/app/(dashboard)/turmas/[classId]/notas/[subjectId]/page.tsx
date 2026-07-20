import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Upload, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { toGradeCellValues, toGradeConfigDTO, toStudentRow } from "@/lib/grades/serialize";
import GradeGridConnected from "@/components/grade-grid/GradeGridConnected";
import { AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";
import { ShareWhatsAppButton } from "@/components/export/ShareWhatsAppButton";
import { GuardianPortalLinkButton } from "@/components/export/GuardianPortalLinkButton";
import { ObservationSuggestionButton } from "@/components/turmas/ObservationSuggestionButton";

interface PageProps {
  params: Promise<{ classId: string; subjectId: string }>;
  searchParams: Promise<{ termId?: string }>;
}

export default async function NotasPage({ params, searchParams }: PageProps) {
  // Next.js 16: params/searchParams são Promises — corrigido aqui (antes
  // eram acessados como objeto síncrono, gerando aviso em toda requisição;
  // mesmo problema já existia em (dashboard)/importar/page.tsx, fora do
  // escopo desta rodada).
  const { classId, subjectId } = await params;
  const { termId } = await searchParams;

  const user = await getCurrentUser();
  if (!user) notFound();

  const classSubject = await prisma.classSubject.findFirst({
    where: {
      classId,
      subjectId,
      class: { tenantId: user.tenantId },
    },
    include: { subject: true, class: true },
  });
  if (!classSubject) notFound();

  const term = termId
    ? await prisma.term.findUnique({ where: { id: termId } })
    : await prisma.term.findFirst({
        where: { academicYear: { tenantId: user.tenantId, isActive: true } },
        orderBy: { order: "desc" },
      });
  if (!term) notFound();

  const [gradeConfigs, enrollments] = await Promise.all([
    prisma.gradeConfig.findMany({
      where: { classSubjectId: classSubject.id, termId: term.id },
      include: { type: true },
      orderBy: { order: "asc" },
    }),
    prisma.enrollment.findMany({
      where: { classId, status: "ATIVA" },
      include: {
        student: true,
        grades: { where: { termId: term.id } },
        attendances: { where: { classSubjectId: classSubject.id } },
      },
      orderBy: { student: { name: "asc" } },
    }),
  ]);

  return (
    <div className="p-6">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-[var(--color-foreground-muted)]" aria-label="Breadcrumb">
        <Link href="/turmas" className="hover:text-brand hover:underline">
          Turmas
        </Link>
        <span>/</span>
        <span>{classSubject.class.name}</span>
        <span>/</span>
        <span className="text-[var(--color-foreground)]">{classSubject.subject.name}</span>
      </nav>

      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-foreground)]">
            {classSubject.subject.name} — {classSubject.class.name}
          </h1>
          <p className="text-sm text-[var(--color-foreground-muted)]">{term.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <a
            href={`/api/export/pdf/mapa-notas?classSubjectId=${classSubject.id}&termId=${term.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            <FileText size={14} />
            Mapa de notas
          </a>
          <Link
            href={`/importar?classId=${classId}&classSubjectId=${classSubject.id}&termId=${term.id}`}
            className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            <Upload size={14} />
            Importar notas
          </Link>
          <Link
            href={`/turmas/${classId}/chamada/${subjectId}`}
            className="flex items-center text-xs font-medium text-brand hover:underline"
          >
            Lançar chamada
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      <GradeGridConnected
        students={enrollments.map(toStudentRow)}
        gradeConfigs={gradeConfigs.map(toGradeConfigDTO)}
        initialGrades={enrollments.flatMap(toGradeCellValues)}
      />

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">Boletins</h2>
        <p className="mb-3 text-xs text-[var(--color-foreground-muted)]">
          O boletim reúne todas as disciplinas da turma, não só {classSubject.subject.name}.
        </p>
        <AnimatedList
          data-theme-surface
          className="divide-y rounded-lg border"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
          staggerChildren={0.03}
        >
          {enrollments.map((e) => (
            <AnimatedListItem
              key={e.id}
              className="flex items-center justify-between px-4 py-2.5"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="text-sm text-[var(--color-foreground)]">{e.student.name}</span>
              <div className="flex items-center gap-3">
                <a
                  href={`/api/export/pdf/boletim?enrollmentId=${e.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Baixar boletim (PDF)
                </a>
                <ShareWhatsAppButton kind="boletim-pdf" params={{ enrollmentId: e.id }} className="!px-2 !py-1 text-[11px]" />
                <GuardianPortalLinkButton enrollmentId={e.id} />
                <ObservationSuggestionButton studentId={e.student.id} studentName={e.student.name} termId={term.id} />
              </div>
            </AnimatedListItem>
          ))}
        </AnimatedList>
      </div>
    </div>
  );
}
