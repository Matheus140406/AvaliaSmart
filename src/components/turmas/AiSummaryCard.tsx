"use client";

/**
 * Resumo de desempenho por IA + export em PDF — POST /api/ai/performance-
 * summary e GET /api/export/pdf/ai-summary já existiam prontos há tempo,
 * sem botão nenhum na UI que os chamasse.
 *
 * O período (termId) não vem como prop — resolvido aqui do mesmo jeito que
 * a tela de notas resolve o "período atual" quando nenhum é passado: o
 * último Term (maior `order`) do ano letivo ativo do tenant, via GET
 * /api/turmas (que já devolve `terms` ordenados).
 */

import { useEffect, useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/motion/AnimatedCard";

interface TermOption {
  id: string;
  name: string;
  order: number;
}

export function AiSummaryCard({ classId }: { classId: string }) {
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [termId, setTermId] = useState<string>("");
  const [summary, setSummary] = useState<string | null>(null);
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
      const res = await fetch("/api/ai/performance-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, termId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível gerar o resumo.");
      setSummary(body.data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar resumo.");
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
          <Sparkles size={15} style={{ color: "var(--color-one)" }} />
          Resumo de desempenho (IA)
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
            {loading ? "Gerando…" : summary ? "Gerar de novo" : "Gerar resumo"}
          </Button>
          {summary && termId && (
            <a
              href={`/api/export/pdf/ai-summary?classId=${classId}&termId=${termId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              <FileText size={14} />
              PDF
            </a>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}
      {summary && <p className="whitespace-pre-line text-sm text-[var(--color-foreground)]">{summary}</p>}
    </AnimatedCard>
  );
}
