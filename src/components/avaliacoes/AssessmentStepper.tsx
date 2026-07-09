"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Check, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AnimatedCard } from "@/components/motion/AnimatedCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { TRANSITION_STATE } from "@/lib/motion";
import { useCreateStore } from "@/stores/create-store";

const STEPS = ["Informações", "Critérios", "Configuração", "Revisão"];

interface ClassOption {
  id: string;
  name: string;
  subjects: { id: string; name: string }[];
}
interface TermOption {
  id: string;
  name: string;
  order: number;
}
interface EvaluationTypeItem {
  id: string;
  name: string;
}

/**
 * Stepper "Nova Avaliação" (design handoff `design_handoff_avaliasmart/`) —
 * backend real em `POST /api/avaliacoes` (cria `GradeConfig`, um por
 * critério). Estado vive em `useCreateStore` (zustand), não `useState`
 * local — ver comentário do store pro motivo.
 */
export function AssessmentStepper() {
  const router = useRouter();
  const store = useCreateStore();
  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [evaluationTypes, setEvaluationTypes] = useState<EvaluationTypeItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/turmas"), fetch("/api/evaluation-types")])
      .then(async ([turmasRes, typesRes]) => {
        const turmasBody = await turmasRes.json().catch(() => ({ success: false }));
        if (!turmasRes.ok || !turmasBody.success) {
          throw new Error(turmasBody.error ?? "Não foi possível carregar as turmas.");
        }
        const typesBody = await typesRes.json().catch(() => ({ success: false }));
        if (!typesRes.ok || !typesBody.success) {
          throw new Error(typesBody.error ?? "Não foi possível carregar os tipos de avaliação.");
        }
        if (!cancelled) {
          setClasses(turmasBody.data.classes);
          setTerms(turmasBody.data.terms ?? []);
          setEvaluationTypes(typesBody.data);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Erro ao carregar turmas.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedClass = classes?.find((c) => c.id === store.classId) ?? null;

  const goNext = () => {
    if (store.step === 0) {
      if (!store.title.trim() || !store.classId) {
        setStepError("Preencha título e turma pra continuar.");
        return;
      }
    }
    setStepError(null);
    store.setStep(Math.min(3, store.step + 1));
  };

  const goBack = () => {
    if (store.step === 0) {
      router.push("/");
      return;
    }
    setStepError(null);
    store.setStep(store.step - 1);
  };

  const handleCreate = async () => {
    if (!store.classId || !store.subjectId || !store.termId || !store.typeId) {
      setSubmitError("Preencha todos os campos obrigatórios antes de criar.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/avaliacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: store.classId,
          subjectId: store.subjectId,
          termId: store.termId,
          title: store.title.trim(),
          typeId: store.typeId,
          criteria: store.criteria.map((c) => ({ name: c.name.trim() || "Critério", weight: c.weight })),
          scheduledDate: store.scheduledDate ? new Date(store.scheduledDate).toISOString() : null,
          maxScore: store.maxScore,
          hasRecovery: store.hasRecovery,
        }),
      });
      const body = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível criar a avaliação.");
      store.setCreated({ classId: store.classId, title: store.title.trim() });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erro ao criar avaliação.");
    } finally {
      setSubmitting(false);
    }
  };

  if (store.created) {
    return <SuccessScreen classId={store.created.classId} title={store.created.title} onCreateAnother={() => store.reset()} />;
  }

  if (loadError) {
    return <p className="text-sm text-rose-500">{loadError}</p>;
  }

  if (!classes) {
    return (
      <div className="mx-auto max-w-xl">
        <Skeleton style={{ height: 320 }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <StepHeader current={store.step} />

      <AnimatedCard
        className="mt-6 rounded-2xl border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={store.step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={TRANSITION_STATE}
          >
            {store.step === 0 && <StepInfo classes={classes} selectedClass={selectedClass} evaluationTypes={evaluationTypes} />}
            {store.step === 1 && <StepCriteria />}
            {store.step === 2 && <StepConfig terms={terms} />}
            {store.step === 3 && (
              <StepReview
                classes={classes}
                terms={terms}
                evaluationTypes={evaluationTypes}
                onSubmit={handleCreate}
                submitting={submitting}
                submitError={submitError}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {stepError && <p className="mt-3 text-xs text-rose-500">{stepError}</p>}

        {store.step < 3 && (
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={goBack}>
              Voltar
            </Button>
            <Button variant="primary" onClick={goNext}>
              Continuar
            </Button>
          </div>
        )}
      </AnimatedCard>
    </div>
  );
}

function StepHeader({ current }: { current: number }) {
  return (
    <div className="flex items-center">
      {STEPS.map((label, i) => (
        <div key={label} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
              style={
                i < current
                  ? { backgroundColor: "var(--color-brand)", color: "#fff" }
                  : i === current
                    ? { backgroundColor: "var(--color-surface)", color: "var(--color-brand)", boxShadow: "0 0 0 4px var(--color-border-soft)", border: "1px solid var(--color-brand)" }
                    : { backgroundColor: "var(--color-surface-muted)", color: "var(--color-foreground-faint)" }
              }
            >
              {i < current ? <Check size={14} /> : i + 1}
            </span>
            <span className="hidden text-[11px] text-[var(--color-foreground-muted)] sm:block">{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className="mx-1 h-0.5 flex-1 rounded-full" style={{ backgroundColor: i < current ? "var(--color-brand)" : "var(--color-border)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

function StepInfo({
  classes,
  selectedClass,
  evaluationTypes,
}: {
  classes: ClassOption[];
  selectedClass: ClassOption | null;
  evaluationTypes: EvaluationTypeItem[];
}) {
  const store = useCreateStore();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--color-foreground-muted)]">Título *</label>
        <input
          type="text"
          value={store.title}
          onChange={(e) => store.setField("title", e.target.value)}
          placeholder="Ex: Prova bimestral — Frações"
          className="input-field h-10 w-full rounded-md px-3 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--color-foreground-muted)]">Turma *</label>
        <Select
          items={classes.map((c) => ({ value: c.id, label: c.name }))}
          value={store.classId ?? undefined}
          onValueChange={(v) => {
            store.setField("classId", v as string);
            store.setField("subjectId", null);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione a turma" />
          </SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--color-foreground-muted)]">Disciplina</label>
        <Select
          items={selectedClass?.subjects.map((s) => ({ value: s.id, label: s.name })) ?? []}
          value={store.subjectId ?? undefined}
          onValueChange={(v) => store.setField("subjectId", v as string)}
          disabled={!selectedClass}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={selectedClass ? "Selecione a disciplina" : "Selecione a turma primeiro"} />
          </SelectTrigger>
          <SelectContent>
            {selectedClass?.subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs font-semibold text-[var(--color-foreground-muted)]">Tipo</label>
          <Link href="/tipos-avaliacao" className="text-xs text-brand underline underline-offset-2">
            Gerenciar tipos
          </Link>
        </div>
        {evaluationTypes.length === 0 ? (
          <p className="text-xs text-[var(--color-foreground-muted)]">
            Nenhum tipo cadastrado ainda —{" "}
            <Link href="/tipos-avaliacao" className="text-brand underline underline-offset-2">
              crie o primeiro
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {evaluationTypes.map((opt) => {
              const active = store.typeId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => store.setField("typeId", opt.id)}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={
                    active
                      ? { backgroundColor: "var(--color-brand-soft)", borderColor: "var(--color-brand)", color: "var(--color-brand)" }
                      : { backgroundColor: "transparent", borderColor: "var(--color-border)", color: "var(--color-foreground-muted)" }
                  }
                >
                  {opt.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StepCriteria() {
  const store = useCreateStore();
  const totalWeight = store.criteria.reduce((sum, c) => sum + (c.weight || 0), 0);
  const isComplete = Math.round(totalWeight) === 100;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--color-foreground-muted)]">Competências avaliadas nesta avaliação e o peso de cada uma.</p>
      {store.criteria.map((c) => (
        <div key={c.id} className="flex items-center gap-2">
          <input
            type="text"
            value={c.name}
            onChange={(e) => store.updateCriterion(c.id, { name: e.target.value })}
            placeholder="Nome do critério"
            className="input-field h-9 flex-1 rounded-md px-3 text-sm"
          />
          <input
            type="number"
            value={c.weight}
            onChange={(e) => store.updateCriterion(c.id, { weight: Number(e.target.value) })}
            className="input-field h-9 w-20 rounded-md px-2 text-sm"
            min={0}
            max={100}
          />
          <span className="text-xs text-[var(--color-foreground-faint)]">%</span>
          <button
            type="button"
            onClick={() => store.removeCriterion(c.id)}
            className="rounded-md p-1.5 text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-muted)]"
            aria-label="Remover critério"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}

      <Button variant="outline" size="default" onClick={() => store.addCriterion()} className="w-fit gap-1.5">
        <Plus size={14} /> Adicionar critério
      </Button>

      <p className="text-xs font-medium" style={{ color: isComplete ? "var(--color-data-positive)" : "var(--color-data-warning-strong)" }}>
        Soma dos pesos: {totalWeight}% {isComplete ? "✓" : "(ideal: 100%)"}
      </p>
    </div>
  );
}

function StepConfig({ terms }: { terms: TermOption[] }) {
  const store = useCreateStore();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--color-foreground-muted)]">Data</label>
        <input
          type="date"
          value={store.scheduledDate}
          onChange={(e) => store.setField("scheduledDate", e.target.value)}
          className="input-field h-10 w-full rounded-md px-3 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--color-foreground-muted)]">Bimestre</label>
        <Select
          items={terms.map((t) => ({ value: t.id, label: t.name }))}
          value={store.termId ?? undefined}
          onValueChange={(v) => store.setField("termId", v as string)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione o bimestre" />
          </SelectTrigger>
          <SelectContent>
            {terms.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--color-foreground-muted)]">Nota máxima</label>
        <input
          type="number"
          value={store.maxScore}
          onChange={(e) => store.setField("maxScore", Number(e.target.value))}
          className="input-field h-10 w-full rounded-md px-3 text-sm"
          min={1}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--color-foreground-muted)]">Permite recuperação?</label>
        <Select
          items={[
            { value: "nao", label: "Não" },
            { value: "sim", label: "Sim" },
          ]}
          value={store.hasRecovery ? "sim" : "nao"}
          onValueChange={(v) => store.setField("hasRecovery", v === "sim")}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nao">Não</SelectItem>
            <SelectItem value="sim">Sim</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function StepReview({
  classes,
  terms,
  evaluationTypes,
  onSubmit,
  submitting,
  submitError,
}: {
  classes: ClassOption[];
  terms: TermOption[];
  evaluationTypes: EvaluationTypeItem[];
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
}) {
  const store = useCreateStore();
  const className = classes.find((c) => c.id === store.classId)?.name ?? "—";
  const subjectName = classes.find((c) => c.id === store.classId)?.subjects.find((s) => s.id === store.subjectId)?.name ?? "—";
  const termName = terms.find((t) => t.id === store.termId)?.name ?? "—";
  const typeLabel = evaluationTypes.find((t) => t.id === store.typeId)?.name ?? "—";

  const rows: [string, string][] = [
    ["Título", store.title || "—"],
    ["Turma", className],
    ["Disciplina", subjectName],
    ["Tipo", typeLabel],
    ["Critérios", store.criteria.map((c) => `${c.name || "Critério"} (${c.weight}%)`).join(", ")],
    ["Data", store.scheduledDate || "não definida"],
    ["Bimestre", termName],
    ["Nota máxima", String(store.maxScore)],
    ["Recuperação", store.hasRecovery ? "Sim" : "Não"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y" style={{ borderColor: "var(--color-border)" }}>
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-2 text-sm">
            <dt className="text-[var(--color-foreground-muted)]">{label}</dt>
            <dd className="text-right font-medium text-[var(--color-foreground)]">{value}</dd>
          </div>
        ))}
      </dl>

      {submitError && <p className="text-xs text-rose-500">{submitError}</p>}

      <Button variant="primary" onClick={onSubmit} disabled={submitting} className="w-full justify-center">
        {submitting ? "Criando…" : "Criar avaliação"}
      </Button>
    </div>
  );
}

function SuccessScreen({ classId, title, onCreateAnother }: { classId: string; title: string; onCreateAnother: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={TRANSITION_STATE}
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--color-data-positive-soft)", color: "var(--color-data-positive)" }}
      >
        <CheckCircle2 size={32} />
      </motion.span>
      <h1 className="font-heading text-xl font-semibold text-[var(--color-foreground)]">Avaliação criada!</h1>
      <p className="text-sm text-[var(--color-foreground-muted)]">&quot;{title}&quot; já está disponível na turma.</p>
      <div className="mt-2 flex gap-3">
        <Link href={`/turmas/${classId}`}>
          <Button variant="primary">Ver turma</Button>
        </Link>
        <Button variant="secondary" onClick={onCreateAnother}>
          Criar outra
        </Button>
      </div>
    </div>
  );
}
