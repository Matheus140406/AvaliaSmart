"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion } from "motion/react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { MessageCircle, Upload, CreditCard, Users, ClipboardCheck, Award, LayoutDashboard, Search, Sparkles, Plus } from "lucide-react";
import { AnimatedCard, AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OneAvatar } from "@/components/one/OneAvatar";
import { fadeSlideUp, TRANSITION_MICRO } from "@/lib/motion";
import type { DashboardSummary } from "@/repositories/dashboard-report.repository";

const MotionLink = motion.create(Link);
const PAGE_SIZE = 5;

/**
 * Painel do professor — busca `/api/dashboard/summary` (JSON, reaproveita o
 * mesmo repository do PDF/Excel já existentes) no client, com Skeleton
 * enquanto carrega. Nenhum dado é fixo/fictício: métricas, gráfico, donut e
 * tabela de atividades vêm todos da API na hora (ver
 * `repositories/dashboard-report.repository.ts` pra origem de cada campo).
 */
export function PainelDashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/summary")
      .then(async (res) => {
        const body = await res.json().catch(() => ({ success: false }));
        if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível carregar o painel.");
        if (!cancelled) setData(body.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar o painel.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-rose-500">{error}</p>;
  }

  if (!data) {
    return <PainelSkeleton />;
  }

  return <PainelContent data={data} />;
}

function PainelSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-4 lg:col-span-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i}>
            <SkeletonText lines={2} />
          </SkeletonCard>
        ))}
      </div>
      <div className="lg:col-span-2">
        <SkeletonCard>
          <Skeleton style={{ height: 220 }} />
        </SkeletonCard>
      </div>
      <SkeletonCard>
        <SkeletonText lines={4} />
      </SkeletonCard>
      <div className="lg:col-span-3">
        <SkeletonCard>
          <SkeletonText lines={5} />
        </SkeletonCard>
      </div>
    </div>
  );
}

function SkeletonCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme-surface
      className="rounded-2xl border p-5"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      {children}
    </div>
  );
}

function CardShell({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <AnimatedCard
      className={`rounded-2xl border p-5 ${className ?? ""}`}
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      <p className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">{title}</p>
      {children}
    </AnimatedCard>
  );
}

function PainelContent({ data }: { data: DashboardSummary }) {
  const chartData = data.classAverages.map((c) => ({ name: c.className, media: c.average ?? 0 }));

  const donutData = [
    { key: "aprovado", label: "Acima da média", value: data.studentStatus.aprovadoPct ?? 0, color: "var(--color-data-positive)" },
    { key: "recuperacao", label: "Em atenção", value: data.studentStatus.recuperacaoPct ?? 0, color: "var(--color-data-warning)" },
    { key: "reprovado", label: "Abaixo da média", value: data.studentStatus.reprovadoPct ?? 0, color: "var(--color-data-negative)" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Hero da One */}
      <DashboardHero attentionCount={data.attentionPoints.length} overallAverage={data.metrics.overallAverage} className="lg:col-span-3" />

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-4 lg:col-span-3 lg:grid-cols-4">
        <MetricCard icon={LayoutDashboard} label="Turmas ativas" value={String(data.metrics.classCount)} />
        <MetricCard icon={Users} label="Alunos" value={String(data.metrics.studentCount)} />
        <MetricCard icon={Award} label="Média geral" value={formatAverage(data.metrics.overallAverage)} />
        <MetricCard icon={ClipboardCheck} label="Avaliações no mês" value={String(data.metrics.assessmentsThisMonth)} />
      </div>

      {/* Desempenho por turma */}
      <CardShell title="Média por turma" className="lg:col-span-2">
        {chartData.length === 0 ? (
          <p className="text-sm text-[var(--color-foreground-muted)]">
            Nenhuma turma com nota lançada ainda no ano letivo ativo.
          </p>
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--color-foreground-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--color-border)" }} tickLine={false} />
                <YAxis domain={[0, 10]} tick={{ fill: "var(--color-foreground-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
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
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-one)" />
                    <stop offset="100%" stopColor="var(--color-brand)" />
                  </linearGradient>
                </defs>
                <Bar dataKey="media" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.media < 7 ? "var(--color-data-warning)" : "url(#barGradient)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardShell>

      {/* Situação dos alunos (donut) */}
      <CardShell title="Situação dos alunos">
        {data.studentStatus.totalWithGrades === 0 ? (
          <p className="text-sm text-[var(--color-foreground-muted)]">
            Nenhum aluno com nota lançada no período atual ainda.
          </p>
        ) : (
          <div className="flex items-center gap-4">
            <div style={{ width: 120, height: 120 }} className="shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="label" innerRadius={38} outerRadius={56} paddingAngle={2}>
                    {donutData.map((d) => (
                      <Cell key={d.key} fill={d.color} stroke="none" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-col gap-2 text-xs">
              {donutData.map((d) => (
                <li key={d.key} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-[var(--color-foreground)]">{Math.round(d.value)}%</span>
                  <span className="text-[var(--color-foreground-muted)]">{d.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardShell>

      {/* Atividades recentes */}
      <div className="lg:col-span-3">
        <RecentActivityCard items={data.recentActivity} />
      </div>

      {/* Pontos de atenção */}
      <CardShell title="Pontos de atenção" className="lg:col-span-3">
        {data.attentionPoints.length === 0 ? (
          <p className="text-sm text-[var(--color-foreground-muted)]">Nenhum ponto de atenção no momento.</p>
        ) : (
          <AnimatedList className="flex max-h-60 flex-col gap-2 overflow-y-auto" staggerChildren={0.04}>
            {data.attentionPoints.slice(0, 12).map((p, i) => (
              <AnimatedListItem key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-data-negative)]" />
                <span className="text-[var(--color-foreground)]">
                  <span className="font-medium">{p.studentName}</span>{" "}
                  <span className="text-[var(--color-foreground-muted)]">
                    ({p.className}) — {p.reason}
                  </span>
                </span>
              </AnimatedListItem>
            ))}
          </AnimatedList>
        )}
      </CardShell>

      {/* Atalhos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-3">
        <ShortcutCard href="/chat" icon={MessageCircle} title="Perguntar para a One" description="Tire dúvidas sobre turmas, notas ou frequência" />
        <ShortcutCard href="/importar" icon={Upload} title="Importar notas" description="Planilha ou foto do boletim" />
        <ShortcutCard href="/planos" icon={CreditCard} title="Plano e cobrança" description="Veja seu plano, faça upgrade ou baixe comprovantes" />
      </div>
    </div>
  );
}

/**
 * Hero da One — a frase contextual muda conforme dados REAIS (pontos de
 * atenção, média geral), não é um texto solto sem relação com o painel.
 */
function DashboardHero({
  attentionCount,
  overallAverage,
  className,
}: {
  attentionCount: number;
  overallAverage: number | null;
  className?: string;
}) {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] ?? "professor(a)";

  let phrase = "Tudo em dia por aqui — sem pontos de atenção no momento.";
  if (attentionCount > 0) {
    phrase = `${attentionCount} ${attentionCount === 1 ? "aluno precisa" : "alunos precisam"} de atenção esse mês.`;
  } else if (overallAverage !== null && overallAverage < 7) {
    phrase = `A média geral está em ${overallAverage.toFixed(1)} — abaixo do ideal.`;
  }

  return (
    <AnimatedCard
      className={`rounded-2xl border p-6 ${className ?? ""}`}
      style={{
        borderColor: "#23314a",
        background: "linear-gradient(120deg, rgba(108,200,240,.14), rgba(139,147,242,.12), rgba(18,21,30,.4))",
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <OneAvatar size={74} glow float />
          <div>
            <p className="font-heading text-xl font-bold text-[var(--color-foreground-strong)]">Olá, {firstName} 👋</p>
            <p className="text-sm text-[var(--color-foreground-muted)]">{phrase}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/chat">
            <Button variant="gradient" className="gap-1.5" style={{ background: "var(--gradient-one)" }}>
              <Sparkles size={15} /> Perguntar à One
            </Button>
          </Link>
          <Link href="/avaliacoes/nova">
            <Button variant="secondary" className="gap-1.5">
              <Plus size={15} /> Nova avaliação
            </Button>
          </Link>
        </div>
      </div>
    </AnimatedCard>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <AnimatedCard
      className="rounded-2xl border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <Icon size={18} />
      </span>
      <p className="font-heading text-2xl font-bold tabular-nums text-[var(--color-foreground-strong)]">{value}</p>
      <p className="text-xs text-[var(--color-foreground-muted)]">{label}</p>
    </AnimatedCard>
  );
}

function RecentActivityCard({ items }: { items: DashboardSummary["recentActivity"] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.studentName.toLowerCase().includes(q) || i.action.toLowerCase().includes(q));
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(pageClamped * PAGE_SIZE, pageClamped * PAGE_SIZE + PAGE_SIZE);

  return (
    <AnimatedCard
      className="rounded-2xl border p-5"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--color-foreground)]">Atividades recentes</p>
        <div className="relative w-48">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--color-foreground-faint)]" />
          <input
            type="text"
            placeholder="Buscar aluno ou ação"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="input-field h-8 w-full rounded-md pr-2 pl-8 text-xs"
          />
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-foreground-muted)]">Nenhuma atividade registrada ainda.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-[var(--color-foreground-muted)]" style={{ borderColor: "var(--color-border)" }}>
                  <th className="py-2 font-medium">Aluno / Turma</th>
                  <th className="py-2 font-medium">Ação</th>
                  <th className="py-2 font-medium">Data</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, i) => (
                  <tr key={i} className="border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
                    <td className="py-2.5">
                      <p className="font-medium text-[var(--color-foreground)]">{item.studentName}</p>
                      <p className="text-xs text-[var(--color-foreground-muted)]">{item.className}</p>
                    </td>
                    <td className="py-2.5 text-[var(--color-foreground-muted)]">{item.action}</td>
                    <td className="py-2.5 text-[var(--color-foreground-muted)]">{formatDate(item.date)}</td>
                    <td className="py-2.5">
                      <Badge
                        variant="outline"
                        className={
                          item.status === "concluido"
                            ? "border-0 bg-[var(--color-data-positive-soft)] text-[var(--color-data-positive)]"
                            : "border-0 bg-[var(--color-data-warning-soft)] text-[var(--color-data-warning-strong)]"
                        }
                      >
                        {item.status === "concluido" ? "Concluído" : "Pendente"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--color-foreground-muted)]">Nenhum resultado pra essa busca.</p>
          ) : (
            <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-foreground-muted)]">
              <span>
                Página {pageClamped + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pageClamped === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="rounded-md border px-2.5 py-1 disabled:opacity-40"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={pageClamped >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="rounded-md border px-2.5 py-1 disabled:opacity-40"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  Próximo
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AnimatedCard>
  );
}

/**
 * Antes era um `<Link>` cru com só `hover:border-brand` (CSS puro, sem
 * elevação nenhuma) — `motion.create(Link)` deixa entrada (fade+slide,
 * mesma variant de `AnimatedCard`) e hover (elevação sutil + borda) tudo
 * dirigido pelo Motion, sem misturar com `:hover` de CSS no mesmo elemento.
 */
function ShortcutCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof MessageCircle;
  title: string;
  description: string;
}) {
  return (
    <MotionLink
      href={href}
      data-theme-surface
      initial="hidden"
      animate="visible"
      variants={fadeSlideUp}
      whileHover={{ y: -3, borderColor: "var(--color-brand)", boxShadow: "0 8px 20px -8px rgba(0,0,0,0.25)" }}
      whileTap={{ y: 0 }}
      transition={TRANSITION_MICRO}
      className="flex items-start gap-3 rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <Icon size={18} />
      </span>
      <span>
        <span className="block text-sm font-medium text-[var(--color-foreground)]">{title}</span>
        <span className="block text-xs text-[var(--color-foreground-muted)]">{description}</span>
      </span>
    </MotionLink>
  );
}

function formatAverage(value: number | null): string {
  return value !== null ? value.toFixed(1) : "—";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
