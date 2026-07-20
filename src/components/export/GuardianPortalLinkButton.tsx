"use client";

/**
 * "Gerar link pro responsável" — diferente do ShareWhatsAppButton (link de
 * 15min, pensado pra um compartilhamento pontual): este usa o kind
 * `boletim-portal` (90 dias), pensado pra o responsável salvar/revisitar
 * sem precisar de login. Mesma infraestrutura de token assinado
 * (ExportShareLink) — só o TTL muda (ver share-link.service.ts).
 */

import { useState } from "react";
import { Link2, Copy, Check } from "lucide-react";

export function GuardianPortalLinkButton({ enrollmentId, className }: { enrollmentId: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/export/share-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "boletim-portal", params: { enrollmentId } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível gerar o link.");
      setUrl(body.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar link.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (url) {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className={`flex items-center gap-1 text-xs font-medium text-brand hover:underline ${className ?? ""}`}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? "Copiado!" : "Copiar link (válido 90 dias)"}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading}
        className={`flex items-center gap-1 text-xs font-medium text-brand hover:underline disabled:opacity-60 ${className ?? ""}`}
      >
        <Link2 size={12} />
        {loading ? "Gerando…" : "Link pro responsável"}
      </button>
      {error && <span className="mt-1 text-[11px] text-rose-500">{error}</span>}
    </span>
  );
}
