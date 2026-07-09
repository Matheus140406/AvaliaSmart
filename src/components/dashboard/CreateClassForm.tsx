"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CreatedSubject {
  id: string;
  name: string;
}

interface CreatedClass {
  id: string;
  name: string;
  gradeLevel: string | null;
  shift: string | null;
  studentCount: number;
  subjects: CreatedSubject[];
}

interface CreatedStudent {
  id: string;
  name: string;
  registrationCode: string | null;
}

const SHIFT_OPTIONS = ["Manhã", "Tarde", "Noite", "EAD"] as const;

/**
 * Cadastro de turma em duas etapas, na mesma tela (sem navegar pra outra
 * rota): (1) dados da turma + disciplinas via `ClassSubject` — campos que
 * já existiam no banco (`Class.academicYearId`, `ClassSubject`) mas não
 * tinham NENHUM formulário até esta rodada, só o seed; (2) cadastro de
 * alunos avulso (`Student` + `Enrollment`) logo após criar a turma, pra não
 * obrigar quem só tem 2-3 alunos pra adicionar a montar uma planilha em
 * `/importar` (esse fluxo continua existindo, complementar, pra quem tem a
 * lista pronta em Excel).
 */
export function CreateClassForm({
  academicYear,
  onDone,
  onCancel,
  onAcademicYearActivated,
}: {
  academicYear: { id: string; year: number } | null;
  onDone: (createdClass: CreatedClass) => void;
  onCancel: () => void;
  onAcademicYearActivated: () => void;
}) {
  const [name, setName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [shift, setShift] = useState("");
  const [subjectInput, setSubjectInput] = useState("");
  const [subjectNames, setSubjectNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createdClass, setCreatedClass] = useState<CreatedClass | null>(null);
  const [activatingYear, setActivatingYear] = useState(false);

  const currentYear = new Date().getFullYear();

  const handleActivateYear = async () => {
    setActivatingYear(true);
    setError(null);
    try {
      const res = await fetch("/api/academic-years/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: currentYear }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível ativar o ano letivo.");
      onAcademicYearActivated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ativar ano letivo.");
    } finally {
      setActivatingYear(false);
    }
  };

  const addSubject = () => {
    const value = subjectInput.trim();
    if (!value) return;
    if (!subjectNames.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setSubjectNames((prev) => [...prev, value]);
    }
    setSubjectInput("");
  };

  const handleSubjectKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSubject();
    }
  };

  const handleCreateClass = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/turmas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          gradeLevel: gradeLevel || undefined,
          shift: shift || undefined,
          subjectNames,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "Não foi possível criar a turma.");
      }
      setCreatedClass(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar turma.");
    } finally {
      setLoading(false);
    }
  };

  if (createdClass) {
    return (
      <AddStudentsStep
        classItem={createdClass}
        onFinish={() => onDone(createdClass)}
      />
    );
  }

  return (
    <form onSubmit={handleCreateClass} className="space-y-3">
      {academicYear ? (
        <p className="text-xs text-[var(--color-foreground-muted)]">Ano letivo: {academicYear.year}</p>
      ) : (
        <p
          data-theme-surface
          className="flex items-start gap-1.5 rounded-md border px-2.5 py-2 text-xs text-amber-600 dark:text-amber-400"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-muted)" }}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Nenhum ano letivo ativo neste workspace —{" "}
            <button
              type="button"
              onClick={handleActivateYear}
              disabled={activatingYear}
              className="font-medium underline underline-offset-2 disabled:opacity-60"
            >
              {activatingYear ? "Ativando…" : `Ativar ${currentYear}`}
            </button>
            .
          </span>
        </p>
      )}

      <input
        type="text"
        placeholder="Nome da turma (ex: 9º Ano B)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        minLength={1}
        className="input-field h-10 w-full rounded-md px-3 text-sm"
      />

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Série (ex: 9º Ano)"
          value={gradeLevel}
          onChange={(e) => setGradeLevel(e.target.value)}
          className="input-field h-10 w-full rounded-md px-3 text-sm"
        />
        <select
          value={shift}
          onChange={(e) => setShift(e.target.value)}
          className="input-field h-10 w-40 shrink-0 rounded-md px-2 text-sm"
        >
          <option value="">Turno</option>
          {SHIFT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Disciplina (ex: Matemática) — pressione Enter para adicionar"
            value={subjectInput}
            onChange={(e) => setSubjectInput(e.target.value)}
            onKeyDown={handleSubjectKeyDown}
            className="input-field h-10 w-full rounded-md px-3 text-sm"
          />
          <Button type="button" variant="secondary" onClick={addSubject}>
            Adicionar
          </Button>
        </div>
        {subjectNames.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {subjectNames.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSubjectNames((prev) => prev.filter((x) => x !== s))}
                className="flex items-center gap-1 rounded-full bg-brand/10 px-2 py-1 text-[11px] font-medium text-brand hover:bg-brand/20"
                title="Remover"
              >
                {s}
                <X size={11} />
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading || !academicYear}>
          {loading ? "Criando…" : "Criar turma"}
        </Button>
      </div>
    </form>
  );
}

function AddStudentsStep({
  classItem,
  onFinish,
}: {
  classItem: CreatedClass;
  onFinish: () => void;
}) {
  const [studentName, setStudentName] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [students, setStudents] = useState<CreatedStudent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAddStudent = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/turmas/${classItem.id}/alunos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: studentName,
          registrationCode: registrationCode || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "Não foi possível cadastrar o aluno.");
      }
      setStudents((prev) => [...prev, body.data]);
      setStudentName("");
      setRegistrationCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar aluno.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-[var(--color-foreground)]">
          Turma &ldquo;{classItem.name}&rdquo; criada — adicionar alunos?
        </p>
        <p className="text-xs text-[var(--color-foreground-muted)]">
          Cadastre um por um aqui, ou pule e importe uma planilha depois pela tela de lançamento de notas da turma.
        </p>
      </div>

      {students.length > 0 && (
        <ul className="space-y-1">
          {students.map((s) => (
            <li key={s.id} className="text-sm text-[var(--color-foreground)]">
              {s.name}
              {s.registrationCode ? ` · ${s.registrationCode}` : ""}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAddStudent} className="flex gap-2">
        <input
          type="text"
          placeholder="Nome do aluno"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          required
          className="input-field h-10 w-full rounded-md px-3 text-sm"
        />
        <input
          type="text"
          placeholder="Matrícula (opcional)"
          value={registrationCode}
          onChange={(e) => setRegistrationCode(e.target.value)}
          className="input-field h-10 w-40 shrink-0 rounded-md px-3 text-sm"
        />
        <Button type="submit" disabled={loading || !studentName.trim()}>
          {loading ? "Adicionando…" : "Adicionar"}
        </Button>
      </form>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <div className="flex justify-end pt-1">
        <Button type="button" variant="ghost" onClick={onFinish}>
          Concluir
        </Button>
      </div>
    </div>
  );
}
