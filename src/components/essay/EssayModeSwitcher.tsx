"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EssayGradingForm } from "@/components/essay/EssayGradingForm";
import { ManualEssayGradingForm } from "@/components/essay/ManualEssayGradingForm";

type Mode = "ai" | "manual";

/** Alterna entre o caminho com IA (correção automática) e o manual (professor corrige e atribui a nota). */
export function EssayModeSwitcher() {
  const [mode, setMode] = useState<Mode>("ai");

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label="Modo de correção"
        data-theme-surface
        className="inline-flex gap-1 rounded-lg p-1"
        style={{ backgroundColor: "var(--color-surface-muted)" }}
      >
        {(["ai", "manual"] as const).map((m) => (
          <Button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            variant={mode === m ? "primary" : "ghost"}
            onClick={() => setMode(m)}
          >
            {m === "ai" ? "Correção com IA" : "Correção manual"}
          </Button>
        ))}
      </div>

      {mode === "ai" ? <EssayGradingForm /> : <ManualEssayGradingForm />}
    </div>
  );
}
