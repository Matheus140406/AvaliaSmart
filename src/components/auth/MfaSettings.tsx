"use client";

/**
 * Autenticação de dois fatores (TOTP) — conta global, não escopada a
 * workspace (por isso mora em /seguranca, fora do grupo (dashboard)).
 * Fluxo: gerar QR -> confirmar com o primeiro código -> mostrar códigos de
 * recuperação UMA VEZ (o backend nunca devolve os códigos de novo depois
 * disso, só os hashes ficam salvos).
 */

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/motion/AnimatedCard";

type Step = "loading" | "disabled" | "setup" | "confirm" | "recovery-codes" | "enabled" | "disable-confirm";

export function MfaSettings() {
  const [step, setStep] = useState<Step>("loading");
  const [qrCodeDataUri, setQrCodeDataUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/account/mfa")
      .then((res) => res.json())
      .then((body) => setStep(body?.data?.mfaEnabled ? "enabled" : "disabled"))
      .catch(() => setStep("disabled"));
  }, []);

  async function handleStartSetup() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/mfa/setup", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível gerar o QR.");
      setQrCodeDataUri(body.data.qrCodeDataUri);
      setSecret(body.data.secret);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar QR.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/mfa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Código inválido.");
      setRecoveryCodes(body.data.recoveryCodes);
      setStep("recovery-codes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao confirmar código.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível desativar.");
      setPassword("");
      setStep("disabled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desativar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyCodes() {
    await navigator.clipboard.writeText(recoveryCodes.join("\n")).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AnimatedCard
      className="rounded-2xl border p-5"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      <div className="mb-3 flex items-center gap-2">
        {step === "enabled" ? <ShieldCheck size={18} className="text-emerald-500" /> : <ShieldOff size={18} className="text-[var(--color-foreground-faint)]" />}
        <p className="font-heading text-sm font-semibold text-[var(--color-foreground)]">Autenticação de dois fatores (2FA)</p>
      </div>

      {step === "loading" && <p className="text-sm text-[var(--color-foreground-muted)]">Carregando…</p>}

      {step === "disabled" && (
        <>
          <p className="mb-3 text-sm text-[var(--color-foreground-muted)]">
            Adicione uma camada extra de segurança: além da senha, um código gerado por um app autenticador (Google
            Authenticator, Authy...) a cada login.
          </p>
          {error && <p className="mb-2 text-xs text-rose-500">{error}</p>}
          <Button type="button" onClick={handleStartSetup} disabled={loading}>
            {loading ? "Gerando…" : "Ativar 2FA"}
          </Button>
        </>
      )}

      {step === "confirm" && qrCodeDataUri && secret && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-foreground-muted)]">
            Escaneie o QR com seu app autenticador, ou digite o código manualmente, depois confirme com o código de
            6 dígitos gerado.
          </p>
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URI gerado dinamicamente, sem benefício de otimização do next/image */}
            <img src={qrCodeDataUri} alt="QR code de configuração do 2FA" width={180} height={180} />
          </div>
          <p className="text-center font-mono text-xs text-[var(--color-foreground-muted)]">{secret}</p>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Código de 6 dígitos"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            className="input-field h-10 w-full rounded-md px-3 text-center text-sm tracking-widest"
          />
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" onClick={handleConfirm} disabled={loading || code.length !== 6}>
              {loading ? "Confirmando…" : "Confirmar e ativar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("disabled")}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {step === "recovery-codes" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-emerald-500">2FA ativado com sucesso.</p>
          <p className="text-sm text-[var(--color-foreground-muted)]">
            Guarde estes códigos de recuperação em um lugar seguro — cada um funciona uma única vez, caso você perca
            acesso ao app autenticador. Eles não serão mostrados de novo.
          </p>
          <div
            className="grid grid-cols-2 gap-2 rounded-lg border p-3 font-mono text-sm"
            style={{ borderColor: "var(--color-border)" }}
          >
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={handleCopyCodes} className="gap-1.5">
              {copied ? (
                <>
                  <Check size={14} /> Copiado
                </>
              ) : (
                <>
                  <Copy size={14} /> Copiar códigos
                </>
              )}
            </Button>
            <Button type="button" onClick={() => setStep("enabled")}>
              Já guardei, concluir
            </Button>
          </div>
        </div>
      )}

      {step === "enabled" && (
        <>
          <p className="mb-3 text-sm text-[var(--color-foreground-muted)]">2FA está ativo nesta conta.</p>
          <Button type="button" variant="secondary" onClick={() => setStep("disable-confirm")}>
            Desativar 2FA
          </Button>
        </>
      )}

      {step === "disable-confirm" && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-foreground-muted)]">
            Confirme sua senha atual para desativar o 2FA.
          </p>
          <input
            type="password"
            placeholder="Senha atual"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="input-field h-10 w-full rounded-md px-3 text-sm"
          />
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleDisable} disabled={loading || !password} className="text-rose-500">
              {loading ? "Desativando…" : "Confirmar desativação"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("enabled")}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </AnimatedCard>
  );
}
