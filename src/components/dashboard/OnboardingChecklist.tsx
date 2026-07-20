"use client";

/**
 * Onboarding guiado pra escola nova — mostrado só quando o tenant ainda não
 * tem NENHUMA turma (workspace recém-criado nasce com AcademicYear+Terms+
 * tipos de avaliação padrão, mas zero turma/aluno — ver POST /api/
 * workspaces). Sem isso, a pessoa cai num dashboard vazio sem indicação de
 * qual é o próximo passo. "Import assistido" (a etapa de maior fricção) tem
 * destaque próprio, apontando direto pro fluxo que a própria tela de
 * turmas > notas já usa (picker de turma/disciplina/período em /importar).
 */

import Link from "next/link";
import { CheckCircle2, Circle, Users, Upload, ClipboardCheck } from "lucide-react";
import { AnimatedCard } from "@/components/motion/AnimatedCard";

interface OnboardingStep {
  label: string;
  description: string;
  href: string;
  icon: typeof Users;
  done: boolean;
}

export function OnboardingChecklist({ classCount, studentCount }: { classCount: number; studentCount: number }) {
  const steps: OnboardingStep[] = [
    {
      label: "Crie sua primeira turma",
      description: "Nome, série/turno e disciplinas — leva menos de 1 minuto.",
      href: "/turmas",
      icon: Users,
      done: classCount > 0,
    },
    {
      label: "Importe ou cadastre os alunos",
      description: "Suba uma planilha (.xlsx/.csv) com nome e notas, ou lance manualmente.",
      href: "/importar",
      icon: Upload,
      done: studentCount > 0,
    },
    {
      label: "Configure as avaliações da turma",
      description: "Prova, trabalho, participação... com peso e nota máxima de cada uma.",
      href: "/avaliacoes/nova",
      icon: ClipboardCheck,
      done: false,
    },
  ];

  // Sem turma nenhuma ainda, o link de import cairia direto no picker de
  // contexto (sem params) — comportamento correto e já tratado por
  // ImportContextPicker, não precisa de link condicional aqui.

  if (steps.every((s) => s.done)) return null;

  return (
    <AnimatedCard
      className="col-span-full rounded-2xl border p-5"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      <p className="mb-1 font-heading text-sm font-semibold text-[var(--color-foreground)]">
        Primeiros passos no AvaliaSmart
      </p>
      <p className="mb-4 text-xs text-[var(--color-foreground-muted)]">
        Complete essas etapas pra começar a lançar notas e frequência.
      </p>

      <ol className="flex flex-col gap-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.label}>
              <Link
                href={step.href}
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:border-brand"
                style={{ borderColor: "var(--color-border)" }}
              >
                {step.done ? (
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />
                ) : (
                  <Circle size={18} className="mt-0.5 shrink-0 text-[var(--color-foreground-faint)]" />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium"
                    style={{
                      color: step.done ? "var(--color-foreground-muted)" : "var(--color-foreground)",
                      textDecoration: step.done ? "line-through" : "none",
                    }}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-[var(--color-foreground-muted)]">{step.description}</p>
                </div>
                <Icon size={16} className="mt-0.5 shrink-0 text-[var(--color-foreground-faint)]" />
              </Link>
            </li>
          );
        })}
      </ol>
    </AnimatedCard>
  );
}
