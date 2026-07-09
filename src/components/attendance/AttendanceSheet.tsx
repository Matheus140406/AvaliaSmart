"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, UserX, Plus } from "lucide-react";
import { AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";
import { SkeletonText } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/button";

interface StudentAttendanceRow {
  enrollmentId: string;
  studentId: string;
  name: string;
  present: boolean;
  justified: boolean;
  recorded: boolean;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 500;
const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Desloca `dateStr` em `delta` meses inteiros, preservando o dia (clamped pro último dia do mês alvo se ele não existir — ex: 31/jan -1 mês -> 28/29 fev). Nunca passa do dia de hoje. */
function shiftMonth(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1 + delta, 1);
  const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDayOfTargetMonth));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (target > today) return todayIsoDate();

  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthLabel(dateStr: string): string {
  const label = MONTH_FORMATTER.format(new Date(`${dateStr}T00:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Lista de chamada — mesmo princípio de auto-save da GradeGrid (debounce
 * por linha + indicador de status pontual), mas mais simples: 1
 * presente/ausente por aluno por data, não várias colunas numéricas
 * ponderadas. Por isso não reaproveita a classe `GradeStore` da GradeGrid
 * (feita pra outro formato de dado) — state + debounce direto no
 * componente, escala bem pro tamanho de uma turma.
 *
 * Navegação por mês (‹ ›) + input de data (dia exato dentro do mês),
 * filtro por nome, cadastro de aluno avulso (reaproveita
 * `POST /api/turmas/[classId]/alunos`, mesma rota do formulário de Nova
 * Turma) e desmatricular (soft — `Enrollment.status = CANCELADA`,
 * histórico de chamada do aluno continua intacto, só some da lista).
 */
export function AttendanceSheet({ classId, classSubjectId }: { classId: string; classSubjectId: string }) {
  const [date, setDate] = useState(todayIsoDate());
  const [students, setStudents] = useState<StudentAttendanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const [filter, setFilter] = useState("");
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [busyEnrollmentId, setBusyEnrollmentId] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentCode, setNewStudentCode] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const loadSheet = useCallback(() => {
    setStudents(null);
    setError(null);
    fetch(`/api/attendance?classSubjectId=${classSubjectId}&date=${date}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({ success: false }));
        if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível carregar a chamada.");
        setStudents(body.data.students);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar a chamada."));
  }, [classSubjectId, date]);

  useEffect(() => {
    loadSheet();
  }, [loadSheet]);

  const persist = useCallback(
    (enrollmentId: string, present: boolean, justified: boolean) => {
      setSaveStatus((prev) => ({ ...prev, [enrollmentId]: "saving" }));
      fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId, classSubjectId, date, present, justified }),
      })
        .then(async (res) => {
          const body = await res.json().catch(() => ({ success: false }));
          if (!res.ok || !body.success) throw new Error(body.error ?? "Falha ao salvar.");
          setSaveStatus((prev) => ({ ...prev, [enrollmentId]: "saved" }));
        })
        .catch(() => setSaveStatus((prev) => ({ ...prev, [enrollmentId]: "error" })));
    },
    [classSubjectId, date]
  );

  const updateRow = (enrollmentId: string, changes: Partial<Pick<StudentAttendanceRow, "present" | "justified">>) => {
    setStudents((prev) =>
      prev ? prev.map((s) => (s.enrollmentId === enrollmentId ? { ...s, ...changes } : s)) : prev
    );

    const existingTimer = debounceTimers.current.get(enrollmentId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      setStudents((current) => {
        const row = current?.find((s) => s.enrollmentId === enrollmentId);
        if (row) persist(enrollmentId, row.present, row.justified);
        return current;
      });
    }, DEBOUNCE_MS);
    debounceTimers.current.set(enrollmentId, timer);
  };

  const handleAddStudent = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/turmas/${classId}/alunos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newStudentName, registrationCode: newStudentCode || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível cadastrar o aluno.");
      setNewStudentName("");
      setNewStudentCode("");
      setShowAddForm(false);
      loadSheet();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Erro ao cadastrar aluno.");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveStudent = async (enrollmentId: string) => {
    setBusyEnrollmentId(enrollmentId);
    try {
      const res = await fetch(`/api/turmas/${classId}/alunos/${enrollmentId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível desmatricular o aluno.");
      setStudents((prev) => (prev ? prev.filter((s) => s.enrollmentId !== enrollmentId) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desmatricular aluno.");
    } finally {
      setBusyEnrollmentId(null);
      setConfirmingRemoveId(null);
    }
  };

  if (error) {
    return <p className="text-sm text-rose-500">{error}</p>;
  }

  const visibleStudents = students?.filter((s) => s.name.toLowerCase().includes(filter.trim().toLowerCase())) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => setDate((d) => shiftMonth(d, -1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="min-w-[130px] text-center text-sm font-medium text-[var(--color-foreground)]">
            {monthLabel(date)}
          </span>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => setDate((d) => shiftMonth(d, 1))}
            disabled={date === todayIsoDate()}
            aria-label="Próximo mês"
          >
            <ChevronRight size={16} />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="attendance-date" className="text-sm text-[var(--color-foreground-muted)]">
            Data
          </label>
          <input
            id="attendance-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayIsoDate()}
            className="input-field h-9 rounded-md px-2 text-sm"
          />
        </div>

        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar por nome…"
          className="input-field h-9 flex-1 rounded-md px-3 text-sm sm:max-w-[220px]"
        />

        <Button type="button" variant="secondary" onClick={() => setShowAddForm((v) => !v)} className="gap-1.5">
          <Plus size={14} /> Cadastrar aluno
        </Button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddStudent}
          data-theme-surface
          className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
        >
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs text-[var(--color-foreground-muted)]">Nome do aluno</label>
            <input
              type="text"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              required
              className="input-field h-9 w-full rounded-md px-3 text-sm"
            />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs text-[var(--color-foreground-muted)]">Matrícula (opcional)</label>
            <input
              type="text"
              value={newStudentCode}
              onChange={(e) => setNewStudentCode(e.target.value)}
              className="input-field h-9 w-full rounded-md px-3 text-sm"
            />
          </div>
          <Button type="submit" disabled={adding || !newStudentName.trim()}>
            {adding ? "Cadastrando…" : "Adicionar"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowAddForm(false)}>
            Cancelar
          </Button>
          {addError && <p className="w-full text-xs text-rose-500">{addError}</p>}
        </form>
      )}

      {!visibleStudents ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              data-theme-surface
              className="rounded-lg border p-4"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
            >
              <SkeletonText lines={1} />
            </div>
          ))}
        </div>
      ) : visibleStudents.length === 0 ? (
        <div
          data-theme-surface
          className="rounded-lg border p-8 text-center"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
        >
          <p className="text-sm text-[var(--color-foreground-muted)]">
            {students?.length === 0 ? "Nenhum aluno matriculado nesta turma." : "Nenhum aluno corresponde ao filtro."}
          </p>
        </div>
      ) : (
        <AnimatedList
          data-theme-surface
          className="divide-y rounded-lg border"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
          staggerChildren={0.03}
        >
          {visibleStudents.map((s) => {
            const status = saveStatus[s.enrollmentId] ?? "idle";
            const isConfirmingRemove = confirmingRemoveId === s.enrollmentId;
            const isBusy = busyEnrollmentId === s.enrollmentId;
            return (
              <AnimatedListItem
                key={s.enrollmentId}
                className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      status === "saving" ? "animate-pulse bg-brand" : status === "saved" ? "bg-emerald-500" : status === "error" ? "bg-rose-500" : "bg-transparent"
                    }`}
                  />
                  <span className="text-sm text-[var(--color-foreground)]">{s.name}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!s.present && (
                    <label className="flex items-center gap-1.5 text-xs text-[var(--color-foreground-muted)]">
                      <input
                        type="checkbox"
                        checked={s.justified}
                        onChange={(e) => updateRow(s.enrollmentId, { justified: e.target.checked })}
                        className="accent-brand"
                      />
                      Justificada
                    </label>
                  )}
                  <Button
                    type="button"
                    variant={s.present ? "primary" : "secondary"}
                    onClick={() => updateRow(s.enrollmentId, { present: true, justified: false })}
                  >
                    Presente
                  </Button>
                  <Button
                    type="button"
                    variant={!s.present ? "primary" : "secondary"}
                    onClick={() => updateRow(s.enrollmentId, { present: false })}
                  >
                    Ausente
                  </Button>

                  {isConfirmingRemove ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleRemoveStudent(s.enrollmentId)}
                        disabled={isBusy}
                        className="text-rose-500"
                      >
                        {isBusy ? "Removendo…" : "Confirmar?"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setConfirmingRemoveId(null)} disabled={isBusy}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmingRemoveId(s.enrollmentId)}
                      aria-label={`Desmatricular ${s.name}`}
                      title="Desmatricular"
                      className="px-2 text-[var(--color-foreground-muted)] hover:text-rose-500"
                    >
                      <UserX size={15} />
                    </Button>
                  )}
                </div>
              </AnimatedListItem>
            );
          })}
        </AnimatedList>
      )}
    </div>
  );
}
