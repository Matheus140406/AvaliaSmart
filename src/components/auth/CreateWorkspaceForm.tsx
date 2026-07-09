"use client";

import { useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/motion/AnimatedCard";
import { TRANSITION_MICRO } from "@/lib/motion";

export default function CreateWorkspaceForm() {
  const { update } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"ESCOLA" | "PROFESSOR_AUTONOMO">("ESCOLA");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error ?? "Não foi possível criar o workspace.");
      }
      // BUG corrigido: a resposta segue o envelope padrão { success, data }
      // — o tenantId mora em `body.data.tenantId`, não em `body.tenantId`
      // direto. Com o campo errado, `update()` era chamado com
      // `activeTenantId: undefined` e a sessão nunca ativava o workspace
      // recém-criado.
      await update({ activeTenantId: body.data.tenantId });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar workspace.");
      setLoading(false);
    }
  };

  return (
    <AnimatedCard
      className="space-y-3 rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-foreground)]">Criar novo workspace</p>
          <p className="text-xs text-[var(--color-foreground-muted)]">
            Você começa com 5 dias de teste grátis, sem necessidade de cartão de crédito.
          </p>
        </div>

        <input
          type="text"
          placeholder="Nome da escola ou seu nome (se autônomo)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          className="input-field h-10 w-full rounded-md px-3 text-sm"
        />

        {/* Seletor de tipo — controle segmentado real: trilho com fundo
            muted, segmento ativo destacado, não dois botões soltos.
            `layoutId` no fundo do segmento ativo: só UM elemento com esse
            id existe por vez (sempre dentro do botão ativo no momento) —
            o Motion detecta a troca de posição/pai e anima o
            deslocamento sozinho (FLIP), em vez de só trocar a cor
            instantaneamente como antes. */}
        <div
          role="radiogroup"
          aria-label="Tipo de workspace"
          data-theme-surface
          className="flex gap-1 rounded-lg bg-[var(--color-surface-muted)] p-1"
        >
          {(
            [
              { value: "ESCOLA", label: "Escola" },
              { value: "PROFESSOR_AUTONOMO", label: "Professor autônomo" },
            ] as const
          ).map((opt) => {
            const isActive = type === opt.value;
            return (
              <Button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                variant="ghost"
                onClick={() => setType(opt.value)}
                className="relative flex-1 overflow-hidden"
                style={{ color: isActive ? "white" : undefined }}
              >
                {isActive && (
                  <motion.span
                    layoutId="workspace-type-pill"
                    className="absolute inset-0 rounded-md bg-brand"
                    style={{ zIndex: 0 }}
                    transition={TRANSITION_MICRO}
                  />
                )}
                <span className="relative z-10">{opt.label}</span>
              </Button>
            );
          })}
        </div>

        {error && <p className="text-xs text-rose-500">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Criando…" : "Criar e começar o teste grátis"}
        </Button>
      </form>
    </AnimatedCard>
  );
}
