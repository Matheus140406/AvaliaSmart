"use client";

import { Suspense, useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/motion/AnimatedCard";
import { OneIcon } from "@/components/one/OneIcon";

/**
 * Validação client-side ESPELHA as regras do servidor (register/route.ts) —
 * feedback imediato aqui, garantia real lá. Após cadastrar, faz signIn
 * automático com as mesmas credenciais e manda pro `callbackUrl` (ex: quem
 * veio de um link de convite volta pra `/convite/aceitar?token=...` em vez
 * de perder o convite no meio do cadastro).
 *
 * Retrofit pro design system real do projeto (tokens de tema, `Button`,
 * `AnimatedCard`, logo oficial) — mesmo padrão de `login/page.tsx`.
 */

function validatePassword(password: string, confirm: string): string | null {
  if (password.length < 8) return "Senha precisa de pelo menos 8 caracteres.";
  if (!/[a-zA-Z]/.test(password)) return "Senha precisa de pelo menos uma letra.";
  if (!/[0-9]/.test(password)) return "Senha precisa de pelo menos um número.";
  if (password !== confirm) return "As senhas não conferem.";
  return null;
}

function RegistrarForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/workspaces";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordChecks = [
    { ok: password.length >= 8, label: "8+ caracteres" },
    { ok: /[a-zA-Z]/.test(password), label: "uma letra" },
    { ok: /[0-9]/.test(password), label: "um número" },
    { ok: password.length > 0 && password === confirm, label: "senhas iguais" },
  ];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validatePassword(password, confirm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const body = await response.json().catch(() => ({ success: false }));

      if (!response.ok || !body.success) {
        setError(body.error ?? "Não foi possível criar a conta.");
        setLoading(false);
        return;
      }

      // Conta criada — loga direto com as mesmas credenciais.
      const result = await signIn("credentials", { email, password, redirect: false });
      if (!result || result.error) {
        // Cadastro ok mas login falhou (raro): manda pro login manual.
        window.location.href = "/login";
        return;
      }
      window.location.href = callbackUrl;
    } catch {
      setError("Erro de conexão. Tente de novo.");
      setLoading(false);
    }
  };

  return (
    <div data-theme-surface className="flex min-h-dvh items-center justify-center bg-[var(--color-surface-muted)] px-4">
      <AnimatedCard
        className="w-full max-w-sm rounded-lg border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Image src="/logo-principal.png" alt="AvaliaSmart" width={40} height={34} className="h-9 w-auto" priority />
          <h1 className="text-lg font-semibold text-[var(--color-foreground)]">Criar conta no AvaliaSmart</h1>
          <p className="text-xs text-[var(--color-foreground-muted)]">5 dias de teste grátis, sem cartão.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            className="input-field h-10 w-full rounded-md px-3 text-sm"
          />
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input-field h-10 w-full rounded-md px-3 text-sm"
          />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input-field h-10 w-full rounded-md px-3 text-sm"
          />
          <input
            type="password"
            placeholder="Confirmar senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="input-field h-10 w-full rounded-md px-3 text-sm"
          />

          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {passwordChecks.map((check) => (
              <li
                key={check.label}
                className={`flex items-center gap-1 text-[11px] ${check.ok ? "text-[var(--color-accent)]" : "text-[var(--color-foreground-muted)]"}`}
              >
                {check.ok ? <Check size={12} /> : <Circle size={12} />} {check.label}
              </li>
            ))}
          </ul>

          {error && <p className="text-xs text-rose-500">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full justify-center">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <OneIcon status="thinking" size={16} label="Criando conta" />
                Criando conta…
              </span>
            ) : (
              "Criar conta"
            )}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-[var(--color-foreground-muted)]">
          <div className="h-px flex-1 bg-[var(--color-border)]" />
          ou
          <div className="h-px flex-1 bg-[var(--color-border)]" />
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => signIn("google", { callbackUrl })}
          className="w-full justify-center"
        >
          Continuar com Google
        </Button>

        <p className="mt-4 text-center text-xs text-[var(--color-foreground-muted)]">
          Já tem conta?{" "}
          <Link href="/login" className="text-brand hover:underline">
            Entrar
          </Link>
        </p>
      </AnimatedCard>
    </div>
  );
}

export default function RegistrarPage() {
  return (
    <Suspense fallback={null}>
      <RegistrarForm />
    </Suspense>
  );
}
