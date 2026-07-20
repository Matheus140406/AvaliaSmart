"use client";

/**
 * BUG CORRIGIDO: `/importar` exige classId+classSubjectId+termId na query,
 * mas nenhum ponto de entrada da app (Sidebar, lista de turmas, painel)
 * passava esses params — todo caminho caía num beco sem saída. O fix
 * primário foi adicionar o link com params certos direto na tela de notas
 * (que já tem os três valores em escopo); este picker é o FALLBACK pra quem
 * ainda chegar em `/importar` sem eles (link direto, favorito antigo, nav
 * global) — deixa a pessoa escolher turma → disciplina → período e navega
 * pra URL completa, sem precisar voltar pra achar a tela de notas certa.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface TermOption {
  id: string;
  name: string;
  order: number;
}

interface SubjectOption {
  id: string;
  classSubjectId: string;
  name: string;
}

interface ClassOption {
  id: string;
  name: string;
  subjects: SubjectOption[];
}

export function ImportContextPicker() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [classId, setClassId] = useState("");
  const [classSubjectId, setClassSubjectId] = useState("");
  const [termId, setTermId] = useState("");

  useEffect(() => {
    fetch("/api/turmas")
      .then((res) => res.json())
      .then((body) => {
        if (!body.success) throw new Error(body.error ?? "Falha ao carregar turmas.");
        setClasses(body.data.classes);
        setTerms(body.data.terms);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar turmas."));
  }, []);

  const selectedClass = useMemo(() => classes?.find((c) => c.id === classId) ?? null, [classes, classId]);

  function handleClassChange(value: string) {
    setClassId(value);
    setClassSubjectId(""); // troca de turma invalida a disciplina escolhida antes
  }

  function handleContinue() {
    if (!classId || !classSubjectId || !termId) return;
    router.push(`/importar?classId=${classId}&classSubjectId=${classSubjectId}&termId=${termId}`);
  }

  if (error) {
    return <p className="text-sm text-rose-600">{error}</p>;
  }

  if (!classes) {
    return <p className="text-sm text-[var(--color-foreground-muted)]">Carregando turmas…</p>;
  }

  if (classes.length === 0) {
    return (
      <p className="text-sm text-[var(--color-foreground-muted)]">
        Nenhuma turma cadastrada ainda. Crie uma turma antes de importar notas.
      </p>
    );
  }

  const selectClassName =
    "w-full rounded-md border px-3 py-2 text-sm text-[var(--color-foreground)] disabled:opacity-50";
  const selectStyle = { borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" };

  return (
    <div className="max-w-sm space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-foreground-muted)]">Turma</label>
        <select
          value={classId}
          onChange={(e) => handleClassChange(e.target.value)}
          className={selectClassName}
          style={selectStyle}
        >
          <option value="">Selecione a turma</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-foreground-muted)]">Disciplina</label>
        <select
          value={classSubjectId}
          onChange={(e) => setClassSubjectId(e.target.value)}
          disabled={!selectedClass}
          className={selectClassName}
          style={selectStyle}
        >
          <option value="">Selecione a disciplina</option>
          {selectedClass?.subjects.map((s) => (
            <option key={s.classSubjectId} value={s.classSubjectId}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-foreground-muted)]">Período</label>
        <select value={termId} onChange={(e) => setTermId(e.target.value)} className={selectClassName} style={selectStyle}>
          <option value="">Selecione o período</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <Button type="button" onClick={handleContinue} disabled={!classId || !classSubjectId || !termId}>
        Continuar
      </Button>
    </div>
  );
}
