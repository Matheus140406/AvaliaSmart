"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/motion/AnimatedCard";

type InputMode = "text" | "image";

interface ManualEssayGradingResult {
  id: string;
  studentLabel: string | null;
  gradedBy: "human";
  overallScore: number;
  overallMaxScore: number;
  annotations: string;
  studentFeedback?: string;
}

interface HistoryEntry {
  id: string;
  gradedBy: string;
  content: { overallScore?: number; overallMaxScore?: number };
  createdAt: string;
}

/**
 * Caminho SEM IA de `/redacao`: o professor já leu a redação (texto colado
 * ou foto — a foto ainda passa por OCR, único uso de IA nesta tela; ver
 * `/api/ai/essay-grading/manual`) e atribui a nota ele mesmo. Mesmo
 * histórico do caminho com IA (busca por `studentLabel`, mesma tabela).
 */
export function ManualEssayGradingForm() {
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [studentLabel, setStudentLabel] = useState("");
  const [overallScore, setOverallScore] = useState("");
  const [overallMaxScore, setOverallMaxScore] = useState("10");
  const [annotations, setAnnotations] = useState("");
  const [studentFeedback, setStudentFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ManualEssayGradingResult | null>(null);

  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyGradedByFilter, setHistoryGradedByFilter] = useState<"" | "ai" | "human">("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  const fetchHistory = async () => {
    const label = studentLabel.trim();
    if (!label) return;
    setHistoryLoading(true);
    setHistory(null);
    try {
      const query = new URLSearchParams({ studentLabel: label });
      if (historyGradedByFilter) query.set("gradedBy", historyGradedByFilter);
      if (historyFrom) query.set("from", historyFrom);
      if (historyTo) query.set("to", historyTo);
      const res = await fetch(`/api/ai/essay-grading/history?${query.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) setHistory(body.data);
    } finally {
      setHistoryLoading(false);
    }
  };

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
    if (studentLabel.trim()) formData.set("studentLabel", studentLabel.trim());
    formData.set("overallScore", overallScore);
    formData.set("overallMaxScore", overallMaxScore);
    formData.set("annotations", annotations);
    if (studentFeedback.trim()) formData.set("studentFeedback", studentFeedback.trim());

    try {
      const res = await fetch("/api/ai/essay-grading/manual", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "Não foi possível salvar a correção agora.");
      }
      setResult(body.data);
      fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar a correção.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    (inputMode === "text" ? text.trim().length >= 50 : Boolean(image)) &&
    overallScore.trim() !== "" &&
    overallMaxScore.trim() !== "" &&
    annotations.trim().length > 0;

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
                A foto ainda passa por OCR (única etapa com IA neste modo) — aceita JPEG, PNG, WEBP ou GIF.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={studentLabel}
              onChange={(e) => setStudentLabel(e.target.value)}
              onBlur={fetchHistory}
              placeholder="Nome ou identificador do aluno (opcional)"
              className="input-field flex-1 rounded-md px-3 py-2 text-sm"
            />
            <Button type="button" variant="secondary" onClick={fetchHistory} disabled={!studentLabel.trim() || historyLoading}>
              <User size={14} className="mr-1" /> Histórico
            </Button>
          </div>

          <div className="flex gap-3">
            <input
              type="number"
              value={overallScore}
              onChange={(e) => setOverallScore(e.target.value)}
              placeholder="Nota"
              min={0}
              className="input-field w-1/2 rounded-md px-3 py-2 text-sm"
            />
            <input
              type="number"
              value={overallMaxScore}
              onChange={(e) => setOverallMaxScore(e.target.value)}
              placeholder="Nota máxima"
              min={1}
              className="input-field w-1/2 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <textarea
            value={annotations}
            onChange={(e) => setAnnotations(e.target.value)}
            placeholder="Suas anotações sobre a redação (obrigatório)…"
            rows={5}
            className="input-field w-full rounded-md px-3 py-2 text-sm"
          />

          <textarea
            value={studentFeedback}
            onChange={(e) => setStudentFeedback(e.target.value)}
            placeholder="Feedback para o aluno (opcional)…"
            rows={3}
            className="input-field w-full rounded-md px-3 py-2 text-sm"
          />

          {error && <p className="text-xs text-rose-500">{error}</p>}

          <Button type="submit" disabled={loading || !canSubmit} className="w-full">
            {loading ? "Salvando…" : "Salvar correção"}
          </Button>
        </form>
      </AnimatedCard>

      {history !== null && (
        <AnimatedCard
          className="space-y-2 rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
        >
          <p className="text-xs font-semibold text-[var(--color-foreground)]">Histórico deste aluno</p>

          <div className="flex flex-wrap gap-2">
            <select
              value={historyGradedByFilter}
              onChange={(e) => setHistoryGradedByFilter(e.target.value as "" | "ai" | "human")}
              onBlur={fetchHistory}
              className="input-field h-8 rounded-md px-2 text-xs"
            >
              <option value="">Todas as corretoras</option>
              <option value="ai">Só IA</option>
              <option value="human">Só manual</option>
            </select>
            <input
              type="date"
              value={historyFrom}
              onChange={(e) => setHistoryFrom(e.target.value)}
              onBlur={fetchHistory}
              className="input-field h-8 rounded-md px-2 text-xs"
              aria-label="De"
            />
            <input
              type="date"
              value={historyTo}
              onChange={(e) => setHistoryTo(e.target.value)}
              onBlur={fetchHistory}
              className="input-field h-8 rounded-md px-2 text-xs"
              aria-label="Até"
            />
            <Button type="button" variant="secondary" onClick={fetchHistory} disabled={historyLoading} className="h-8 px-2 text-xs">
              Filtrar
            </Button>
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-[var(--color-foreground-muted)]">Nenhuma redação anterior encontrada.</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between text-xs text-[var(--color-foreground-muted)]">
                  <span>
                    {new Date(h.createdAt).toLocaleDateString("pt-BR")} · {h.gradedBy === "human" ? "Manual" : "IA"}
                  </span>
                  <span>
                    {h.content.overallScore ?? "?"}/{h.content.overallMaxScore ?? "?"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AnimatedCard>
      )}

      {result && (
        <AnimatedCard
          className="space-y-3 rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <span
              data-theme-surface
              className="rounded-full border px-2.5 py-1 text-xs font-semibold text-[var(--color-foreground)]"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-muted)" }}
            >
              CORREÇÃO MANUAL
            </span>
            <p className="text-lg font-semibold text-[var(--color-foreground)]">
              {result.overallScore} / {result.overallMaxScore}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-[var(--color-foreground)]">Suas anotações</p>
            <p className="text-sm text-[var(--color-foreground)]">{result.annotations}</p>
          </div>
          {result.studentFeedback && (
            <div>
              <p className="mb-1 text-xs font-semibold text-[var(--color-foreground)]">Feedback para o aluno</p>
              <p className="text-sm text-[var(--color-foreground)]">{result.studentFeedback}</p>
            </div>
          )}
        </AnimatedCard>
      )}
    </div>
  );
}
