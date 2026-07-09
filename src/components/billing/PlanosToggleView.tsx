"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check } from "lucide-react";
import type { PlanRecord } from "@/repositories/plan.repository";
import { AnimatedCard } from "@/components/motion/AnimatedCard";
import UpgradeButton from "@/components/billing/UpgradeButton";
import { TRANSITION_MICRO } from "@/lib/motion";

/**
 * Cópia client-safe de `formatPriceCents` (repositories/plan.repository.ts)
 * — NÃO importar a original aqui: aquele arquivo importa `prisma`
 * (server-only, puxa `pg`/`node:async_hooks`), e mesmo só usando a função
 * pura, o bundler arrasta o módulo inteiro pro client e quebra o build
 * (reproduzido ao vivo: "chunking context does not support external
 * modules"). Mesma lógica, arquivo diferente.
 */
function formatPriceCents(cents: number, suffix?: "/mês" | "/ciclo"): string {
  if (cents === 0) return "Grátis";
  const value = (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return suffix ? `${value}${suffix}` : value;
}

type Mode = "mensal" | "prepago";

const MENSAL_TIERS = new Set(["MENSAL_BASE", "MENSAL_AVANCADO"]);
const PREPAGO_TIERS = new Set(["TRIMESTRAL", "SEMESTRAL"]);

/** `null` = tier que não é nem Mensal nem Pré-pago (ex: TESTE_GRATIS) — nunca aparece em nenhuma das duas abas, então "escondido pelo toggle" não se aplica a ele do jeito normal (ver `currentHiddenByToggle`, que trata esse caso à parte). */
function modeOf(tier: string): Mode | null {
  if (MENSAL_TIERS.has(tier)) return "mensal";
  if (PREPAGO_TIERS.has(tier)) return "prepago";
  return null;
}

function highlightsFor(plan: PlanRecord): string[] {
  const items: string[] = [];
  items.push(plan.maxUsers === null ? "Usuários ilimitados" : `Até ${plan.maxUsers} usuário(s)`);
  items.push(
    plan.maxClasses === null && plan.maxStudents === null
      ? "Turmas e alunos ilimitados"
      : `Até ${plan.maxClasses ?? "∞"} turmas e ${plan.maxStudents ?? "∞"} alunos`
  );
  if (plan.features.ocr) items.push("Lançamento por foto (OCR com IA)");
  if (plan.features.aiAssistant) items.push("Assistente pedagógico com IA");
  if (plan.features.riskPrediction) items.push("Predição de risco de reprovação");
  if (plan.features.advancedExports) items.push("Exports avançados (ata, mapa de notas, auditoria)");
  if (plan.features.prioritySupport) items.push("Suporte prioritário");
  return items;
}

export function PlanosToggleView({
  plans,
  currentTier,
  isCurrentUsable,
  featuredTier,
}: {
  plans: PlanRecord[];
  currentTier: string | null;
  isCurrentUsable: boolean;
  featuredTier: string;
}) {
  const currentMode = currentTier ? modeOf(currentTier) : null;
  const [mode, setMode] = useState<Mode>(currentMode ?? "mensal");

  const visiblePlans = plans.filter((p) => modeOf(p.tier) === mode);
  const currentPlanName = currentTier ? plans.find((p) => p.tier === currentTier)?.name : null;
  // Cobre tanto "plano pago na outra aba" (currentMode existe e é diferente
  // da aba atual) quanto "plano nem aparece em nenhuma aba" (TESTE_GRATIS,
  // currentMode null) — nos dois casos o professor não vê o plano atual em
  // lugar nenhum da grade, então o indicador precisa aparecer.
  const currentHiddenByToggle = isCurrentUsable && currentTier !== null && (currentMode === null || currentMode !== mode);

  // "Economize X%" no Semestral — compara o equivalente mensal dele contra
  // o Mensal Avançado (mesma faixa de features; os planos pré-pagos são,
  // na prática, o Avançado pago adiantado por mais tempo com desconto).
  const mensalAvancado = plans.find((p) => p.tier === "MENSAL_AVANCADO");
  const semestral = plans.find((p) => p.tier === "SEMESTRAL");
  const semestralSavingsPct =
    mensalAvancado && semestral
      ? Math.round((1 - semestral.priceCentsMonthlyEquiv / mensalAvancado.priceCentsMonthlyEquiv) * 100)
      : null;

  return (
    <div>
      {currentHiddenByToggle && (
        <p className="mb-3 text-xs text-[var(--color-foreground-muted)]">
          Seu plano atual: <span className="font-medium text-[var(--color-foreground)]">{currentPlanName}</span>
        </p>
      )}

      <div
        role="tablist"
        aria-label="Período de cobrança"
        data-theme-surface
        className="mb-6 inline-flex gap-1 rounded-lg p-1"
        style={{ backgroundColor: "var(--color-surface-muted)" }}
      >
        {(["mensal", "prepago"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{
              backgroundColor: mode === m ? "var(--color-surface)" : "transparent",
              color: mode === m ? "var(--color-brand)" : "var(--color-foreground-muted)",
              boxShadow: mode === m ? "0 1px 2px rgba(0,0,0,0.06)" : undefined,
            }}
          >
            {m === "mensal" ? "Mensal" : "Planos pré-pagos (com desconto)"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={TRANSITION_MICRO}
          className="grid gap-4 sm:grid-cols-2"
        >
          {visiblePlans.map((plan) => {
            const isCurrent = currentTier === plan.tier && isCurrentUsable;
            const isFeatured = plan.tier === featuredTier;
            const showSavingsTag = mode === "prepago" && plan.tier === "SEMESTRAL" && semestralSavingsPct !== null && semestralSavingsPct > 0;

            return (
              <AnimatedCard
                key={plan.tier}
                hover
                className="flex h-full flex-col rounded-2xl border-2 p-5"
                style={{
                  borderColor: isCurrent ? "var(--color-data-positive)" : isFeatured ? "var(--color-brand)" : "var(--color-border)",
                  backgroundColor: "var(--color-surface-raised)",
                  boxShadow: isCurrent
                    ? "0 0 24px -6px color-mix(in srgb, var(--color-data-positive) 45%, transparent)"
                    : isFeatured
                      ? "0 0 24px -6px rgba(var(--color-brand-rgb), 0.35)"
                      : undefined,
                }}
              >
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {isCurrent && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: "var(--color-data-positive)" }}
                    >
                      Seu plano atual
                    </span>
                  )}
                  {!isCurrent && isFeatured && (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-medium text-white">Melhor custo-benefício</span>
                  )}
                  {showSavingsTag && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: "var(--color-data-warning-strong, #d97706)" }}
                    >
                      Economize {semestralSavingsPct}%
                    </span>
                  )}
                </div>

                <p className="text-sm font-semibold text-[var(--color-foreground)]">{plan.name}</p>

                {mode === "mensal" ? (
                  <>
                    <p className="mt-1 text-xl font-bold text-[var(--color-foreground)]">
                      {formatPriceCents(plan.priceCentsMonthlyEquiv, "/mês")}
                    </p>
                    <p className="text-[11px] text-[var(--color-foreground-muted)]">Cobrado mensalmente</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-xl font-bold text-[var(--color-foreground)]">
                      {formatPriceCents(plan.priceCentsTotal)} a cada {plan.durationDays} dias
                    </p>
                    <p className="text-[11px] text-[var(--color-foreground-muted)]">Pagamento à vista, sem parcelamento</p>
                  </>
                )}

                <ul className="mt-4 flex-1 space-y-1.5">
                  {highlightsFor(plan).map((h) => (
                    <li key={h} className="flex items-start gap-1.5 text-xs text-[var(--color-foreground-muted)]">
                      <Check size={13} className="mt-0.5 shrink-0 text-[var(--color-data-positive)]" />
                      {h}
                    </li>
                  ))}
                </ul>

                <div className="mt-5">
                  {isCurrent ? (
                    <p
                      className="flex h-9 items-center justify-center rounded-md text-xs font-medium"
                      style={{ backgroundColor: "color-mix(in srgb, var(--color-data-positive) 12%, transparent)", color: "var(--color-data-positive)" }}
                    >
                      Ativo
                    </p>
                  ) : (
                    <UpgradeButton
                      tier={plan.tier as "MENSAL_BASE" | "MENSAL_AVANCADO" | "TRIMESTRAL" | "SEMESTRAL"}
                      label={`Assinar ${plan.name}`}
                      featured={isFeatured}
                    />
                  )}
                </div>
              </AnimatedCard>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
