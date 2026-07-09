"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";

type PaidTier = "MENSAL_BASE" | "MENSAL_AVANCADO" | "TRIMESTRAL" | "SEMESTRAL";

/**
 * Clique abre um Drawer (não mais formulário espremido dentro do card) com
 * os dados do pagador (o Asaas exige CPF/CNPJ pra criar o cliente); o
 * submit chama `/api/billing/checkout` — MESMA rota já existente, nenhuma
 * nova — e redireciona pra fatura do gateway (Pix/boleto/cartão).
 *
 * Drawer, não modal centralizado: mesmo critério já usado em "Nova turma"
 * — 3 campos com contexto (nome/e-mail/CPF-CNPJ do pagador, potencialmente
 * mais no futuro) combina melhor com um painel lateral do que um popup
 * pequeno centralizado.
 *
 * Ativação do plano continua só no webhook (`/api/billing/webhook*`) —
 * este componente só chama o checkout e redireciona pra fatura; reconferido
 * na rota `/api/billing/checkout` nesta mesma rodada, nenhuma mudança lá.
 */
export default function UpgradeButton({
  tier,
  label,
  featured,
}: {
  tier: PaidTier;
  label: string;
  featured?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, payerName, payerEmail, cpfCnpj }),
      });
      const body = await response.json().catch(() => ({ success: false }));
      if (!response.ok || !body.success) {
        throw new Error(body.error ?? "Não foi possível processar.");
      }
      if (body.data?.checkoutUrl) {
        // Fatura do gateway ativo — Pix/boleto/cartão. O plano ativa via
        // webhook quando o pagamento confirmar.
        window.location.href = body.data.checkoutUrl;
        return;
      }
      // Fallback de dev (nenhum gateway configurado): plano aplicado direto.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar.");
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant={featured ? "primary" : "secondary"} onClick={() => setOpen(true)} className="w-full justify-center">
        {label}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Dados para pagamento" variant="drawer">
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-xs text-[var(--color-foreground-muted)]">
            Preencha os dados abaixo para confirmar sua assinatura com segurança. Seus dados estão protegidos.
          </p>

          <div>
            <label htmlFor="upgrade-payer-name" className="mb-1 block text-xs font-medium text-[var(--color-foreground-muted)]">
              Nome completo do titular
            </label>
            <input
              id="upgrade-payer-name"
              type="text"
              placeholder="Digite seu nome como está no cartão"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              required
              minLength={2}
              className="input-field h-10 w-full rounded-md px-3 text-sm"
            />
          </div>

          <div>
            <label htmlFor="upgrade-payer-email" className="mb-1 block text-xs font-medium text-[var(--color-foreground-muted)]">
              E-mail para envio da nota fiscal
            </label>
            <input
              id="upgrade-payer-email"
              type="email"
              placeholder="exemplo@email.com"
              value={payerEmail}
              onChange={(e) => setPayerEmail(e.target.value)}
              required
              className="input-field h-10 w-full rounded-md px-3 text-sm"
            />
          </div>

          <div>
            <label htmlFor="upgrade-payer-document" className="mb-1 block text-xs font-medium text-[var(--color-foreground-muted)]">
              CPF ou CNPJ
            </label>
            <input
              id="upgrade-payer-document"
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00 ou 00.000.000/0001-00"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              className="input-field h-10 w-full rounded-md px-3 text-sm"
            />
          </div>

          {error && <p className="text-xs text-rose-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Gerando…" : "Confirmar e ir para o Mercado Pago 🔒"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
