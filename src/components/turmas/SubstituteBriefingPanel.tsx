"use client";

/**
 * "Modo professor substituto" (Etapa 10) — briefing rápido de IA pra quem
 * vai assumir a turma sem contexto prévio. POST /api/ai/substitute-briefing.
 * Mesmo padrão de resolução de período do RiskPredictionPanel/AiSummaryCard.
 */

import { useEffect, useState } from "react";
import { UserCog, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard, AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";

interface TermOption {
  id: string;
  name: string;
  order: number;
}

interface Briefing {
  className: string;
  termName: string;
  overview: string;
  attentionStudents: { studentId: string; studentName: string; reason: string }[];
  tips: string[];
  studentsOmitted: number;
}

export function SubstituteBriefingPanel({ classId }: { classId: string }) {
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [termId, setTermId] = useState<string>("");
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/turmas")
      .then((res) => res.json())
      .then((body) => {
        if (!body.success) return;
        const loadedTerms: TermOption[] = body.data.terms;
        setTerms(loadedTerms);
        const latest = [...loadedTerms].sort((a, b) => b.order - a.order)[0];
        if (latest) setTermId(latest.id);
      })
      .catch(() => {
        /* seletor de período fica vazio; o botão abaixo permanece desabilitado */
      });
  }, []);

  async function handleGenerate() {
    if (!termId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/substitute-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, termId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível gerar o briefing agora.");
      setBriefing(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar briefing.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatedCard
      className="space-y-3 rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-foreground)]">
          <UserCog size={15} className="text-brand" />
          Modo professor substituto (IA)
        </h2>

        <div className="flex items-center gap-2">
          {terms.length > 1 && (
            <select
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              className="input-field h-8 rounded-md px-2 text-xs"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <Button onClick={handleGenerate} disabled={!termId || loading} className="h-8 px-3 text-xs">
            {loading ? "Preparando…" : briefing ? "Gerar de novo" : "Gerar briefing"}
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      {briefing && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-foreground)]">{briefing.overview}</p>

          {briefing.attentionStudents.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[var(--color-foreground-muted)]">Fique de olho em:</p>
              <AnimatedList className="space-y-1.5" staggerChildren={0.03}>
                {briefing.attentionStudents.map((s) => (
                  <AnimatedListItem key={s.studentId}>
                    <div className="flex items-start gap-2 rounded-lg border p-2" style={{ borderColor: "var(--color-border)" }}>
                      <AlertCircle size={13} className="mt-0.5 shrink-0 text-amber-500" />
                      <p className="text-xs">
                        <span className="font-medium text-[var(--color-foreground)]">{s.studentName}</span>{" "}
                        <span className="text-[var(--color-foreground-muted)]">— {s.reason}</span>
                      </p>
                    </div>
                  </AnimatedListItem>
                ))}
              </AnimatedList>
            </div>
          )}

          {briefing.tips.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[var(--color-foreground-muted)]">Dicas pra hoje:</p>
              <ul className="list-inside list-disc space-y-1 text-xs text-[var(--color-foreground)]">
                {briefing.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          {briefing.studentsOmitted > 0 && (
            <p className="text-[11px] text-[var(--color-foreground-faint)]">
              Turma grande: {briefing.studentsOmitted} aluno(s) não entraram nesta análise.
            </p>
          )}
        </div>
      )}
    </AnimatedCard>
  );
}
