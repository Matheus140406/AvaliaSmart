"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/motion/AnimatedCard";
import { OneIcon } from "@/components/one/OneIcon";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    // Sempre mostra a mesma tela de sucesso, exista ou não a conta —
    // a API já responde de forma idêntica nos dois casos, de propósito.
    setSent(true);
    setLoading(false);
  };

  return (
    <div data-theme-surface className="flex min-h-dvh items-center justify-center bg-[var(--color-surface-muted)] px-4">
      <AnimatedCard
        className="w-full max-w-sm rounded-lg border p-6 text-center"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <div className="mb-6 flex flex-col items-center gap-2">
          <OneIcon status="idle" size={40} />
        </div>

        {sent ? (
          <>
            <p className="text-sm text-[var(--color-foreground)]">
              Se <strong>{email}</strong> tiver uma conta, enviamos um link de redefinição para esse endereço.
            </p>
            <Link href="/login" className="mt-4 inline-block text-sm text-brand hover:underline">
              Voltar ao login
            </Link>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Esqueci minha senha</h1>
            <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">
              Informe seu e-mail para receber o link de redefinição.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3 text-left">
              <input
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-field h-10 w-full rounded-md px-3 text-sm"
              />
              <Button type="submit" disabled={loading} className="w-full justify-center">
                {loading ? "Enviando…" : "Enviar link"}
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-[var(--color-foreground-muted)]">
              <Link href="/login" className="text-brand hover:underline">
                Voltar ao login
              </Link>
            </p>
          </>
        )}
      </AnimatedCard>
    </div>
  );
}
