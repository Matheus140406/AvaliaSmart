"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import type { ExportShareLinkKind } from "@/services/export/share-link.service";

/**
 * "Compartilhar no WhatsApp" — ao lado de qualquer botão "Baixar PDF/Excel"
 * já existente (dashboard, boletim, comprovante). O WhatsApp só aceita
 * compartilhar TEXTO/link via `wa.me` (não dá pra anexar arquivo direto por
 * URL scheme), então o fluxo é: pede um link de download temporário e
 * assinado (`POST /api/export/share-link` — as rotas de export normais
 * exigem cookie de sessão, não funcionariam coladas cruas num link de
 * WhatsApp) e abre o `wa.me` com esse link já preenchido no texto, numa
 * aba nova.
 */
export function ShareWhatsAppButton({
  kind,
  params,
  className,
}: {
  kind: ExportShareLinkKind;
  params?: Record<string, string>;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/export/share-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, params: params ?? {} }),
      });
      const body = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "Não foi possível gerar o link de compartilhamento.");
      }
      const text = `Confira o relatório: ${body.data.url}`;
      const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(waUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao compartilhar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        data-theme-surface
        className={`rounded-md border px-3 py-2 text-[var(--color-foreground)] hover:border-brand disabled:opacity-60 ${className ?? ""}`}
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <Share2 size={13} className="mr-1.5 inline-block align-[-2px]" />
        {loading ? "Gerando link…" : "Compartilhar no WhatsApp"}
      </button>
      {error && <span className="mt-1 text-[11px] text-rose-500">{error}</span>}
    </span>
  );
}
