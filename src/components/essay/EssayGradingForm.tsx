"use client";

import { useState, type FormEvent } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/motion/AnimatedCard";

type InputMode = "text" | "image";
type CriteriaMode = "ENEM" | "custom";

interface CompetencyScore {
  competency: string;
  score: number;
  maxScore: number;
  feedback: string;
}

interface EssayGradingResult {
  id: string;
  studentLabel: string | null;
  isSuggestion: true;
  disclaimer: string;
  anonymizationNotice: string;
  overallScore: number;
  overallMaxScore: number;
  competencyScores: CompetencyScore[];
  strengths: string[];
  improvements: string[];
  studentFeedback: string;
}

/**
 * Formulário de `/redacao` — a rota `POST /api/ai/essay-grading` já
 * existia (texto OU imagem, ENEM OU critério livre); só faltava a tela.
 * PDF ainda NÃO é aceito pela rota (só JPEG/PNG/WEBP/GIF) — aviso fica
 * explícito no formulário em vez de deixar o usuário descobrir só depois
 * de um upload falhar.
 */
export function EssayGradingForm() {
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [criteriaMode, setCriteriaMode] = useState<CriteriaMode>("ENEM");
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [customCriteria, setCustomCriteria] = useState("");
  const [studentLabel, setStudentLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EssayGradingResult | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    if (inputMode === "text") {
      formData.set("text", text);
    } else if (image) {
      formData.set("image", image);
    }
    if (criteriaMode === "ENEM") {
      formData.set("criteriaPreset", "ENEM");
    } else {
      formData.set("customCriteria", customCriteria);
    }
    if (studentLabel.trim()) formData.set("studentLabel", studentLabel.trim());

    try {
      const res = await fetch("/api/ai/essay-grading", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "Não foi possível corrigir a redação agora.");
      }
      setResult(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao corrigir a redação.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    (inputMode === "text" ? text.trim().length >= 50 : Boolean(image)) &&
    (criteriaMode === "ENEM" || customCriteria.trim().length >= 10);

  return (
    <div className="space-y-6">
      <AnimatedCard
        className="space-y-4 rounded-lg border p-4"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div role="radiogroup" aria-label="Origem do texto" data-theme-surface className="flex gap-1 rounded-lg bg-[var(--color-surface-muted)] p-1">
            {(["text", "image"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                role="radio"
                aria-checked={inputMode === mode}
                variant={inputMode === mode ? "primary" : "ghost"}
                onClick={() => setInputMode(mode)}
                className="flex-1"
              >
                {mode === "text" ? "Colar texto" : "Enviar foto"}
              </Button>
            ))}
          </div>

          {inputMode === "text" ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Cole o texto da redação aqui (mínimo 50 caracteres)…"
              rows={8}
              className="input-field w-full rounded-md px-3 py-2 text-sm"
            />
          ) : (
            <div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                className="input-field w-full rounded-md px-3 py-2 text-sm"
              />
              <p className="mt-1.5 flex items-center gap-1 text-xs text-[var(--color-foreground-muted)]">
                <AlertTriangle size={13} className="shrink-0 text-amber-500" />
                Aceita JPEG, PNG, WEBP ou GIF — PDF ainda não é suportado.
              </p>
            </div>
          )}

          <div role="radiogroup" aria-label="Critério de avaliação" data-theme-surface className="flex gap-1 rounded-lg bg-[var(--color-surface-muted)] p-1">
            {(["ENEM", "custom"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                role="radio"
                aria-checked={criteriaMode === mode}
                variant={criteriaMode === mode ? "primary" : "ghost"}
                onClick={() => setCriteriaMode(mode)}
                className="flex-1"
              >
                {mode === "ENEM" ? "Critério ENEM" : "Critério próprio"}
              </Button>
            ))}
          </div>

          {criteriaMode === "custom" && (
            <textarea
              value={customCriteria}
              onChange={(e) => setCustomCriteria(e.target.value)}
              placeholder="Descreva o critério de correção (mínimo 10 caracteres)…"
              rows={3}
              className="input-field w-full rounded-md px-3 py-2 text-sm"
            />
          )}

          <div>
            <input
              type="text"
              value={studentLabel}
              onChange={(e) => setStudentLabel(e.target.value)}
              placeholder="Nome ou identificador do aluno (opcional)"
              className="input-field w-full rounded-md px-3 py-2 text-sm"
            />
            <p className="mt-1.5 text-xs text-[var(--color-foreground-muted)]">
              Se preenchido, esse nome é removido do texto antes de ir para a IA (não cobre autoidentificação livre dentro da redação).
            </p>
          </div>

          {error && <p className="text-xs text-rose-500">{error}</p>}

          <Button type="submit" disabled={loading || !canSubmit} className="w-full">
            {loading ? "Corrigindo…" : "Corrigir redação"}
          </Button>
        </form>
      </AnimatedCard>

      {result && <EssayGradingResultCard result={result} />}
    </div>
  );
}

function EssayGradingResultCard({ result }: { result: EssayGradingResult }) {
  return (
    <AnimatedCard
      className="space-y-4 rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          data-theme-surface
          className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold text-brand"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-muted)" }}
        >
          <Sparkles size={13} />
          SUGESTÃO DE IA
        </span>
        <p className="text-lg font-semibold text-[var(--color-foreground)]">
          {result.overallScore.toFixed(0)} / {result.overallMaxScore.toFixed(0)}
        </p>
      </div>

      <p className="text-xs text-[var(--color-foreground-muted)]">{result.disclaimer}</p>
      <p className="flex items-start gap-1.5 text-xs text-[var(--color-foreground-muted)]">
        <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
        {result.anonymizationNotice}
      </p>

      <div className="space-y-2">
        {result.competencyScores.map((c) => (
          <div key={c.competency} data-theme-surface className="rounded-md border p-3" style={{ borderColor: "var(--color-border)" }}>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-medium text-[var(--color-foreground)]">{c.competency}</p>
              <p className="text-sm text-[var(--color-foreground-muted)]">
                {c.score.toFixed(0)}/{c.maxScore.toFixed(0)}
              </p>
            </div>
            <p className="text-xs text-[var(--color-foreground-muted)]">{c.feedback}</p>
          </div>
        ))}
      </div>

      {result.strengths.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-[var(--color-foreground)]">Pontos fortes</p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-[var(--color-foreground-muted)]">
            {result.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {result.improvements.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-[var(--color-foreground)]">Pontos a melhorar</p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-[var(--color-foreground-muted)]">
            {result.improvements.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold text-[var(--color-foreground)]">Feedback para o aluno</p>
        <p className="text-sm text-[var(--color-foreground)]">{result.studentFeedback}</p>
      </div>
    </AnimatedCard>
  );
}
