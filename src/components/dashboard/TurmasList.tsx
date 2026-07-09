"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";
import { SkeletonText } from "@/components/ui/Skeleton";
import { LinkButton } from "@/components/ui/LinkButton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OneAvatar } from "@/components/one/OneAvatar";
import { CreateClassForm } from "@/components/dashboard/CreateClassForm";

interface ClassSubjectOption {
  id: string;
  name: string;
}

interface ClassRow {
  id: string;
  name: string;
  gradeLevel: string | null;
  shift: string | null;
  studentCount: number;
  subjects: ClassSubjectOption[];
}

interface AcademicYearOption {
  id: string;
  year: number;
}

/**
 * Lista de turmas — busca `/api/turmas` no client (Skeleton enquanto
 * carrega, igual ao painel), nenhum dado fixo. Cada card decide sozinho
 * pra onde navegar: 1 disciplina só -> vai direto pra
 * `/turmas/[classId]/notas/[subjectId]`; mais de uma -> mostra um chip por
 * disciplina; nenhuma -> card inerte avisando que falta configurar.
 *
 * `showCreateForm` + `refresh()`: antes desta rodada não existia NENHUM
 * jeito de criar turma pela UI (só via seed) — `CreateClassForm` cobre
 * turma + disciplinas (`ClassSubject`) + cadastro de alunos avulso, e ao
 * concluir dispara `refresh()` pra reaproveitar o mesmo fetch do mount em
 * vez de manter dois caminhos de carregar a lista.
 */
export function TurmasList() {
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [academicYear, setAcademicYear] = useState<AcademicYearOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const refresh = () => {
    fetch("/api/turmas")
      .then(async (res) => {
        const body = await res.json().catch(() => ({ success: false }));
        if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível carregar as turmas.");
        setClasses(body.data.classes);
        setAcademicYear(body.data.academicYear);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Erro ao carregar as turmas.");
      });
  };

  useEffect(() => {
    refresh();
  }, []);

  if (error) {
    return <p className="text-sm text-rose-500">{error}</p>;
  }

  if (!classes) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            data-theme-surface
            className="rounded-lg border p-5"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
          >
            <SkeletonText lines={3} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setShowCreateForm(true)}>
          <Plus size={15} className="mr-1 inline-block align-[-2px]" />
          Nova turma
        </Button>
      </div>

      <Sheet open={showCreateForm} onOpenChange={setShowCreateForm}>
        <SheetContent side="right" className="w-[420px]">
          <SheetHeader>
            <SheetTitle>Nova turma</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            <CreateClassForm
              academicYear={academicYear}
              onCancel={() => setShowCreateForm(false)}
              onDone={() => {
                setShowCreateForm(false);
                refresh();
              }}
              onAcademicYearActivated={refresh}
            />
          </div>
        </SheetContent>
      </Sheet>

      {classes.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl border p-10 text-center"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
        >
          <OneAvatar size={96} glow float />
          <div>
            <p className="mb-1 font-heading text-base font-semibold text-[var(--color-foreground-strong)]">
              Vamos criar sua primeira turma?
            </p>
            <p className="text-sm text-[var(--color-foreground-muted)]">
              Crie sua primeira turma, ou importe uma planilha para cadastrar turmas e lançar notas de uma vez.
            </p>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Button variant="gradient" onClick={() => setShowCreateForm(true)}>
              <Plus size={15} className="mr-1 inline-block align-[-2px]" />
              Nova turma
            </Button>
            <LinkButton href="/importar" variant="secondary">
              Importar dados
            </LinkButton>
          </div>
        </div>
      ) : (
        <AnimatedList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" staggerChildren={0.06}>
          {classes.map((c) => (
            <AnimatedListItem key={c.id}>
              <ClassCard classItem={c} />
            </AnimatedListItem>
          ))}
        </AnimatedList>
      )}
    </div>
  );
}

function ClassCard({ classItem }: { classItem: ClassRow }) {
  const { id, name, gradeLevel, shift, studentCount, subjects } = classItem;

  const cardBody = (
    <>
      <p className="text-sm font-semibold text-[var(--color-foreground)]">{name}</p>
      <p className="text-xs text-[var(--color-foreground-muted)]">
        {[gradeLevel, shift].filter(Boolean).join(" · ") || "Sem série/turno definido"}
      </p>
      <p className="mt-2 text-xs text-[var(--color-foreground-muted)]">
        {studentCount} {studentCount === 1 ? "aluno" : "alunos"}
      </p>
    </>
  );

  if (subjects.length === 0) {
    return (
      <div
        data-theme-surface
        className="rounded-lg border p-4 opacity-60"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        {cardBody}
        <p className="mt-3 text-xs text-[var(--color-foreground-muted)]">Nenhuma disciplina configurada ainda.</p>
      </div>
    );
  }

  if (subjects.length === 1) {
    const subjectId = subjects[0].id;
    return (
      <div
        data-theme-surface
        className="rounded-lg border p-4 hover:border-brand"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <Link href={`/turmas/${id}/notas/${subjectId}`} className="block">
          {cardBody}
        </Link>
        <div className="mt-3 flex gap-3 text-xs font-medium">
          <Link href={`/turmas/${id}/notas/${subjectId}`} className="text-brand hover:underline">
            Notas
          </Link>
          <Link
            href={`/turmas/${id}/chamada/${subjectId}`}
            className="text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)] hover:underline"
          >
            Chamada
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      data-theme-surface
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      {cardBody}
      <p className="mt-3 text-[11px] text-[var(--color-foreground-muted)]">Escolha a disciplina:</p>
      <div className="mt-1 space-y-1.5">
        {subjects.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-brand/10 px-2 py-1 text-[11px] font-medium text-brand">{s.name}</span>
            <div className="flex gap-2 text-[11px] font-medium">
              <Link href={`/turmas/${id}/notas/${s.id}`} className="text-brand hover:underline">
                Notas
              </Link>
              <Link
                href={`/turmas/${id}/chamada/${s.id}`}
                className="text-[var(--color-foreground-muted)] hover:text-[var(--color-foreground)] hover:underline"
              >
                Chamada
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
