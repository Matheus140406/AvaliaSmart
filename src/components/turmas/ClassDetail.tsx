"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Sparkles, ArrowRight } from "lucide-react";
import { AnimatedCard, AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { AiSummaryCard } from "@/components/turmas/AiSummaryCard";

interface ClassDetailData {
  class: { id: string; name: string; gradeLevel: string | null; shift: string | null; studentCount: number };
  metrics: { averageGrade: number | null; attendancePct: number | null };
  attentionStudents: { studentName: string; className: string; reason: string }[];
  timeline: { type: "avaliacao" | "resumo_one"; title: string; description: string; date: string }[];
}

/** "Detalhes da Turma" (handoff de design) — busca `/api/turmas/[classId]` no client, nenhum dado fixo. */
export function ClassDetail({ classId }: { classId: string }) {
  const [data, setData] = useState<ClassDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/turmas/${classId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({ success: false }));
        if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível carregar a turma.");
        if (!cancelled) setData(body.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar a turma.");
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  if (error) return <p className="text-sm text-rose-500">{error}</p>;
  if (!data) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton style={{ height: 280 }} />
        <Skeleton style={{ height: 280 }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AiSummaryCard classId={classId} />

      <div className="grid gap-4 lg:grid-cols-2">
      {/* Coluna esquerda */}
      <div className="flex flex-col gap-4">
        <AnimatedCard
          className="rounded-2xl border p-5"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl font-heading text-sm font-bold"
              style={{ backgroundColor: "var(--color-brand-soft)", color: "var(--color-brand)" }}
            >
              {data.class.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <p className="font-heading text-base font-semibold text-[var(--color-foreground)]">{data.class.name}</p>
              <p className="text-xs text-[var(--color-foreground-muted)]">
                {[data.class.gradeLevel, data.class.shift].filter(Boolean).join(" · ") || "Sem série/turno definido"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
            <MiniStat label="Alunos" value={String(data.class.studentCount)} />
            <MiniStat label="Média" value={data.metrics.averageGrade !== null ? data.metrics.averageGrade.toFixed(1) : "—"} />
            <MiniStat label="Frequência" value={data.metrics.attendancePct !== null ? `${Math.round(data.metrics.attendancePct)}%` : "—"} />
          </div>
        </AnimatedCard>

        <AnimatedCard
          className="rounded-2xl border p-5"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
        >
          <p className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">Alunos em atenção</p>
          {data.attentionStudents.length === 0 ? (
            <p className="text-sm text-[var(--color-foreground-muted)]">Nenhum aluno sinalizado no momento.</p>
          ) : (
            <AnimatedList className="flex flex-col gap-2.5" staggerChildren={0.04}>
              {data.attentionStudents.map((s, i) => (
                <AnimatedListItem key={i} className="flex items-center gap-2.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: "var(--color-data-negative)" }}
                  >
                    {s.studentName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="text-sm">
                    <span className="font-medium text-[var(--color-foreground)]">{s.studentName}</span>{" "}
                    <span className="text-[var(--color-foreground-muted)]">— {s.reason}</span>
                  </span>
                </AnimatedListItem>
              ))}
            </AnimatedList>
          )}
        </AnimatedCard>
      </div>

      {/* Coluna direita — linha do tempo */}
      <AnimatedCard
        className="rounded-2xl border p-5"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--color-foreground)]">Linha do tempo</p>
          <Link href="/chat" className="flex items-center gap-1 text-xs font-medium text-brand hover:underline">
            Resumo com a One <ArrowRight size={12} />
          </Link>
        </div>

        {data.timeline.length === 0 ? (
          <p className="text-sm text-[var(--color-foreground-muted)]">Nenhum evento registrado ainda.</p>
        ) : (
          <ol className="relative flex flex-col gap-5 border-l pl-5" style={{ borderColor: "var(--color-border)" }}>
            {data.timeline.map((item, i) => {
              const Icon = item.type === "resumo_one" ? Sparkles : ClipboardCheck;
              return (
                <li key={i} className="relative">
                  <span
                    className="absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ left: -33, backgroundColor: "var(--color-brand-soft)", color: "var(--color-brand)" }}
                  >
                    <Icon size={11} />
                  </span>
                  <p className="text-sm font-medium text-[var(--color-foreground)]">{item.title}</p>
                  <p className="text-xs text-[var(--color-foreground-muted)]">{item.description}</p>
                  <p className="text-[11px] text-[var(--color-foreground-faint)]">{formatDate(item.date)}</p>
                </li>
              );
            })}
          </ol>
        )}
      </AnimatedCard>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="font-heading text-lg font-bold text-[var(--color-foreground)]">{value}</p>
      <p className="text-[11px] text-[var(--color-foreground-muted)]">{label}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
