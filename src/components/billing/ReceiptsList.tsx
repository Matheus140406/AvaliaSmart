"use client";

/**
 * Lista de comprovantes de pagamento — GET /api/billing/receipts e o
 * download em GET /api/billing/receipts/[id]/pdf já existiam prontos, sem
 * tela nenhuma que os chamasse (o e-mail automático de pagamento já anexa o
 * PDF, mas não havia como revisitar comprovantes antigos pela UI).
 */

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

interface ReceiptItem {
  id: string;
  gateway: string;
  planName: string;
  amountCents: number;
  paidAt: string;
}

const GATEWAY_LABEL: Record<string, string> = {
  mercadopago: "Mercado Pago",
  asaas: "Asaas",
};

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ReceiptsList() {
  const [receipts, setReceipts] = useState<ReceiptItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/receipts")
      .then((res) => res.json())
      .then((body) => {
        if (!body.success) throw new Error(body.error ?? "Falha ao carregar comprovantes.");
        setReceipts(body.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar comprovantes."));
  }, []);

  // 403 pra quem não é ADMIN — não mostra a seção nesse caso, sem alarde.
  if (error) return null;
  if (!receipts) {
    return <p className="text-sm text-[var(--color-foreground-muted)]">Carregando comprovantes…</p>;
  }
  if (receipts.length === 0) {
    return <p className="text-sm text-[var(--color-foreground-muted)]">Nenhum pagamento registrado ainda.</p>;
  }

  return (
    <div className="divide-y rounded-lg border" style={{ borderColor: "var(--color-border)" }}>
      {receipts.map((receipt) => (
        <div
          key={receipt.id}
          className="flex items-center justify-between gap-3 px-4 py-2.5"
          style={{ backgroundColor: "var(--color-surface-raised)" }}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-foreground)]">
              {receipt.planName} — {formatCents(receipt.amountCents)}
            </p>
            <p className="text-xs text-[var(--color-foreground-muted)]">
              {new Date(receipt.paidAt).toLocaleDateString("pt-BR")} · {GATEWAY_LABEL[receipt.gateway] ?? receipt.gateway}
            </p>
          </div>
          <a
            href={`/api/billing/receipts/${receipt.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            <Download size={14} />
            PDF
          </a>
        </div>
      ))}
    </div>
  );
}
