"use client";

/**
 * Geração automática de comunicado pra pais/responsáveis (Etapa 9) — o
 * professor descreve o assunto (reunião, aviso, recado pontual), a IA
 * escreve o rascunho pronto pra copiar ou mandar direto por WhatsApp.
 * Escopo TURMA abre o wa.me sem número (usuário escolhe o contato/grupo);
 * escopo ALUNO lista os responsáveis cadastrados com telefone, um botão de
 * WhatsApp por contato.
 */

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Copy, Check, Share2 } from "lucide-react";
import type { CommunicationScope, CommunicationTone, GuardianContact } from "@/services/ai/parent-communication.service";

export function ParentCommunicationModal({
  open,
  onClose,
  scopeType,
  scopeId,
  scopeLabel,
}: {
  open: boolean;
  onClose: () => void;
  scopeType: CommunicationScope;
  scopeId: string;
  scopeLabel: string;
}) {
  const [context, setContext] = useState("");
  const [tone, setTone] = useState<CommunicationTone>("formal");
  const [message, setMessage] = useState<string | null>(null);
  const [guardians, setGuardians] = useState<GuardianContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    if (context.trim().length < 5) {
      setError("Descreva o assunto do comunicado (mínimo 5 caracteres).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/parent-communication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeType, scopeId, context, tone }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível gerar o comunicado.");
      setMessage(body.data.message);
      setGuardians(body.data.guardians ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar comunicado.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!message) return;
    await navigator.clipboard.writeText(message).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp(phone?: string | null) {
    if (!message) return;
    const digits = phone?.replace(/\D/g, "");
    const base = digits ? `https://wa.me/55${digits}` : "https://wa.me/";
    window.open(`${base}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function handleClose() {
    setContext("");
    setTone("formal");
    setMessage(null);
    setGuardians([]);
    setError(null);
    setCopied(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Comunicado pra pais — ${scopeLabel}`} variant="center">
      <div className="space-y-3">
        {!message && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--color-foreground-muted)]" htmlFor="comunicado-contexto">
                Assunto do comunicado
              </label>
              <textarea
                id="comunicado-contexto"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Ex: Reunião de pais dia 25/07 às 19h no auditório da escola."
                rows={3}
                className="w-full rounded-lg border p-2.5 text-sm"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-[var(--color-foreground-muted)]">Tom:</span>
              <button
                type="button"
                onClick={() => setTone("formal")}
                className="rounded-full border px-2.5 py-1"
                style={{
                  borderColor: tone === "formal" ? "var(--color-brand)" : "var(--color-border)",
                  color: tone === "formal" ? "var(--color-brand)" : "var(--color-foreground-muted)",
                }}
              >
                Formal
              </button>
              <button
                type="button"
                onClick={() => setTone("informal")}
                className="rounded-full border px-2.5 py-1"
                style={{
                  borderColor: tone === "informal" ? "var(--color-brand)" : "var(--color-border)",
                  color: tone === "informal" ? "var(--color-brand)" : "var(--color-foreground-muted)",
                }}
              >
                Informal
              </button>
            </div>

            {error && <p className="text-xs text-rose-500">{error}</p>}

            <Button type="button" onClick={handleGenerate} disabled={loading} className="w-full">
              {loading ? "Gerando…" : "Gerar comunicado com IA"}
            </Button>
          </>
        )}

        {message && (
          <div className="space-y-3">
            <div
              className="whitespace-pre-wrap rounded-lg border p-3 text-sm text-[var(--color-foreground)]"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
            >
              {message}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" onClick={handleCopy} className="h-8 gap-1 px-2.5 text-xs">
                {copied ? (
                  <>
                    <Check size={13} /> Copiado
                  </>
                ) : (
                  <>
                    <Copy size={13} /> Copiar texto
                  </>
                )}
              </Button>

              {guardians.length > 0 ? (
                guardians.map((g, i) => (
                  <Button
                    key={i}
                    type="button"
                    variant="ghost"
                    onClick={() => shareWhatsApp(g.phone)}
                    disabled={!g.phone}
                    className="h-8 gap-1 px-2.5 text-xs"
                    title={g.phone ? undefined : `${g.name} não tem telefone cadastrado`}
                  >
                    <Share2 size={13} /> WhatsApp — {g.name}
                  </Button>
                ))
              ) : (
                <Button type="button" variant="ghost" onClick={() => shareWhatsApp(null)} className="h-8 gap-1 px-2.5 text-xs">
                  <Share2 size={13} /> Compartilhar no WhatsApp
                </Button>
              )}
            </div>

            <Button type="button" variant="ghost" onClick={() => setMessage(null)} className="h-8 px-2.5 text-xs">
              Gerar outro
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
