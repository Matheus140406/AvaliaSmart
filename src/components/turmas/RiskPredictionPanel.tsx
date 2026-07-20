"use client";

/**
 * Predição de risco de reprovação (IA) — POST /api/analytics/predict, que
 * até esta rodada devolvia 501 (esqueleto) mas já era vendida como feature
 * em todos os planos, inclusive o trial (ver PlanosToggleView.tsx). Mesmo
 * padrão de resolução de período do AiSummaryCard: sem prop de termId,
 * resolvido aqui a partir de GET /api/turmas (último Term por `order`).
 */

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard, AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";

interface TermOption {
  id: string;
  name: string;
  order: number;
}

interface RiskAssessment {
  studentId: string;
  studentName: string;
  riskLevel: "BAIXO" | "MEDIO" | "ALTO";
  reasoning: string;
}

const RISK_STYLES: Record<RiskAssessment["riskLevel"], { label: string; className: string }> = {
  BAIXO: { label: "Baixo risco", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  MEDIO: { label: "Risco médio", className: "bg-amber-100 text-amber-700 border-amber-200" },
  ALTO: { label: "Alto risco", className: "bg-rose-100 text-rose-700 border-rose-200" },
};

const RISK_ORDER: Record<RiskAssessment["riskLevel"], number> = { ALTO: 0, MEDIO: 1, BAIXO: 2 };

export function RiskPredictionPanel({ classId }: { classId: string }) {
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [termId, setTermId] = useState<string>("");
  const [assessments, setAssessments] = useState<RiskAssessment[] | null>(null);
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

  async function handlePredict() {
    if (!termId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, termId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível prever o risco agora.");
      setAssessments(
        [...body.data].sort((a, b) => RISK_ORDER[a.riskLevel as RiskAssessment["riskLevel"]] - RISK_ORDER[b.riskLevel as RiskAssessment["riskLevel"]])
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao prever risco.");
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
          <AlertTriangle size={15} className="text-amber-500" />
          Predição de risco de reprovação (IA)
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
          <Button onClick={handlePredict} disabled={!termId || loading} className="h-8 px-3 text-xs">
            {loading ? "Analisando…" : assessments ? "Analisar de novo" : "Analisar turma"}
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      {assessments && (
        <AnimatedList className="space-y-2" staggerChildren={0.03}>
          {assessments.map((a) => (
            <AnimatedListItem key={a.studentId}>
              <div
                className="flex items-start justify-between gap-3 rounded-lg border p-2.5"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-foreground)]">{a.studentName}</p>
                  <p className="text-xs text-[var(--color-foreground-muted)]">{a.reasoning}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${RISK_STYLES[a.riskLevel].className}`}
                >
                  {RISK_STYLES[a.riskLevel].label}
                </span>
              </div>
            </AnimatedListItem>
          ))}
        </AnimatedList>
      )}
    </AnimatedCard>
  );
}
