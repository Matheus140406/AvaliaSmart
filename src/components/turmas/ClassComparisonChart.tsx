"use client";

/**
 * Comparativo aluno vs. média da turma — cada barra é um aluno, a linha
 * pontilhada é a média da turma; abaixo da linha salta à vista sem precisar
 * ler número por número. Reaproveita o mesmo padrão visual/paleta de
 * `PainelDashboard.tsx` (gradiente marca->one, cor de aviso pra abaixo do
 * limiar de aprovação).
 */

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PASSING_AVERAGE } from "@/types/grade-grid";

interface TermOption {
  id: string;
  name: string;
  order: number;
}

interface ComparisonData {
  className: string;
  termName: string;
  classAverage: number | null;
  students: { studentId: string; name: string; average: number | null }[];
}

export function ClassComparisonChart({ classId }: { classId: string }) {
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<ComparisonData | null>(null);
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
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!termId) return;
    setError(null);
    fetch(`/api/turmas/${classId}/comparativo?termId=${termId}`)
      .then((res) => res.json())
      .then((body) => {
        if (!body.success) throw new Error(body.error ?? "Falha ao carregar comparativo.");
        setData(body.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar comparativo."));
  }, [classId, termId]);

  const chartData = useMemo(
    () =>
      (data?.students ?? [])
        .filter((s) => s.average !== null)
        .map((s) => ({ name: s.name.split(" ")[0], average: s.average as number })),
    [data]
  );

  if (error) return <p className="text-xs text-rose-500">{error}</p>;
  if (!data) return <p className="text-sm text-[var(--color-foreground-muted)]">Carregando comparativo…</p>;

  return (
    <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-foreground)]">Comparativo — aluno vs. média da turma</h2>
        {terms.length > 1 && (
          <select value={termId} onChange={(e) => setTermId(e.target.value)} className="input-field h-8 rounded-md px-2 text-xs">
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {chartData.length === 0 ? (
        <p className="text-sm text-[var(--color-foreground-muted)]">Nenhum aluno com nota lançada ainda neste período.</p>
      ) : (
        <div style={{ width: "100%", height: Math.max(200, chartData.length * 28) }}>
          <ResponsiveContainer>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis type="number" domain={[0, 10]} tick={{ fill: "var(--color-foreground-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fill: "var(--color-foreground-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "var(--color-surface-muted)" }}
                contentStyle={{
                  backgroundColor: "var(--color-surface-raised)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--color-foreground)",
                }}
                formatter={(value) => [typeof value === "number" ? value.toFixed(1) : String(value), "Média"]}
              />
              <defs>
                <linearGradient id="comparisonBarGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--color-one)" />
                  <stop offset="100%" stopColor="var(--color-brand)" />
                </linearGradient>
              </defs>
              {data.classAverage !== null && (
                <ReferenceLine
                  x={data.classAverage}
                  stroke="var(--color-foreground-muted)"
                  strokeDasharray="4 4"
                  label={{ value: `Média da turma: ${data.classAverage.toFixed(1)}`, position: "top", fill: "var(--color-foreground-muted)", fontSize: 11 }}
                />
              )}
              <Bar dataKey="average" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.average < PASSING_AVERAGE ? "var(--color-data-warning)" : "url(#comparisonBarGradient)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
