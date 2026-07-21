"use client";

/**
 * Segundo fator pra quem entrou via Google numa conta com MFA ativado —
 * ver proxy.ts (`session.mfaPending`) e o callback jwt em lib/auth.ts.
 * Mesmo padrão de `update()` do WorkspaceSwitcher: confirma o código,
 * `update({ mfaVerified: true })` limpa o claim pendente no JWT, e só
 * então navega pro app.
 */

import { useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function MfaVerifyForm() {
  const { update } = useSession();
  const router = useRouter();

  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/mfa/verify-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useRecoveryCode ? { recoveryCode } : { totpCode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Código inválido.");

      await update({ mfaVerified: true });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao verificar código.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 text-left">
      {!useRecoveryCode ? (
        <input
          type="text"
          inputMode="numeric"
          placeholder="Código de 6 dígitos"
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value)}
          maxLength={6}
          required
          autoFocus
          disabled={loading}
          className="input-field h-10 w-full rounded-md px-3 text-center text-sm tracking-widest"
        />
      ) : (
        <input
          type="text"
          placeholder="Código de recuperação"
          value={recoveryCode}
          onChange={(e) => setRecoveryCode(e.target.value)}
          required
          autoFocus
          disabled={loading}
          className="input-field h-10 w-full rounded-md px-3 text-center text-sm"
        />
      )}
      {error && <p className="text-xs text-rose-500">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full justify-center">
        {loading ? "Verificando…" : "Verificar"}
      </Button>
      <button
        type="button"
        onClick={() => setUseRecoveryCode((v) => !v)}
        className="w-full text-center text-xs text-brand hover:underline"
      >
        {useRecoveryCode ? "Usar código do app" : "Usar código de recuperação"}
      </button>
    </form>
  );
}
