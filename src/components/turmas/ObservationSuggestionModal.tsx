"use client";

/**
 * Sugestão de observação de boletim por IA + "salvar como modelo" — a rota
 * POST /api/ai/observation-suggestions existia desde sempre sem nenhuma
 * tela que a chamasse (órfã). Aqui ela finalmente ganha UI, junto com o
 * banco de observações reutilizáveis (Fase 3 do épico de novas features):
 * cada sugestão pode ser salva como modelo pra reusar em outro aluno.
 */

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Save, Check } from "lucide-react";

interface Suggestion {
  id: string; // AiObservationSuggestion.id — o feedback (👍/👎) é por lote, não por frase individual
  text: string;
}

export function ObservationSuggestionModal({
  open,
  onClose,
  studentId,
  studentName,
  termId,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  termId: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestionSetId, setSuggestionSetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState(false);
  const [savedTexts, setSavedTexts] = useState<Set<string>>(new Set());

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setFeedbackGiven(false);
    try {
      const res = await fetch("/api/ai/observation-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, termId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível gerar sugestões.");
      setSuggestionSetId(body.data.id);
      setSuggestions(body.data.suggestions.map((text: string, i: number) => ({ id: `${body.data.id}-${i}`, text })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar sugestões.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFeedback(feedback: "POSITIVO" | "NEGATIVO") {
    if (!suggestionSetId || feedbackGiven) return;
    setFeedbackGiven(true);
    await fetch(`/api/ai/observation-suggestions/${suggestionSetId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    }).catch(() => {
      /* feedback é best-effort, não bloqueia o fluxo */
    });
  }

  async function handleSaveAsTemplate(text: string) {
    try {
      const res = await fetch("/api/observation-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível salvar.");
      setSavedTexts((prev) => new Set(prev).add(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar modelo.");
    }
  }

  function handleClose() {
    setSuggestions(null);
    setSuggestionSetId(null);
    setError(null);
    setFeedbackGiven(false);
    setSavedTexts(new Set());
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Sugestão de observação — ${studentName}`} variant="center">
      <div className="space-y-3">
        {!suggestions && !loading && (
          <Button type="button" onClick={handleGenerate} className="w-full">
            Gerar sugestões com IA
          </Button>
        )}
        {loading && <p className="text-sm text-[var(--color-foreground-muted)]">Gerando…</p>}
        {error && <p className="text-xs text-rose-500">{error}</p>}

        {suggestions && (
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border p-3 text-sm text-[var(--color-foreground)]"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
              >
                <p className="mb-2">{s.text}</p>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleSaveAsTemplate(s.text)}
                  disabled={savedTexts.has(s.text)}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  {savedTexts.has(s.text) ? (
                    <>
                      <Check size={12} /> Salvo
                    </>
                  ) : (
                    <>
                      <Save size={12} /> Salvar como modelo
                    </>
                  )}
                </Button>
              </div>
            ))}

            <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--color-border)" }}>
              <span className="text-xs text-[var(--color-foreground-muted)]">Essas sugestões ajudaram?</span>
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => handleFeedback("POSITIVO")} disabled={feedbackGiven} className="h-7 px-2" aria-label="Sugestões úteis">
                  <ThumbsUp size={14} />
                </Button>
                <Button variant="ghost" onClick={() => handleFeedback("NEGATIVO")} disabled={feedbackGiven} className="h-7 px-2" aria-label="Sugestões não úteis">
                  <ThumbsDown size={14} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
