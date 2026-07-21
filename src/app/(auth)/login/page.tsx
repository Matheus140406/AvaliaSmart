"use client";

import { Suspense, useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/motion/AnimatedCard";
import { OneIcon } from "@/components/one/OneIcon";
import { PasswordInput } from "@/components/auth/PasswordInput";

/**
 * Retrofit desta tela pro design system real do projeto (tokens de tema,
 * `Button`, `AnimatedCard`, logo oficial) — antes usava classes soltas
 * (`bg-neutral-900`, `text-blue-600` etc.) que ignoravam dark/light mode.
 *
 * Mantém os DOIS métodos de login: o backend (`lib/auth.ts`) tem Credentials
 * (bcrypt) e Google de verdade, nenhum dos dois é decorativo.
 */
function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/workspaces";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Segundo fator (2FA) — só aparece quando a senha bate e a conta tem MFA
  // ativado (sinalizado pelo `code: "mfa-required"` que `authorize()` joga
  // via MfaRequiredError, ver lib/auth.ts).
  const [mfaRequired, setMfaRequired] = useState(false);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      totpCode: mfaRequired && !useRecoveryCode ? totpCode : undefined,
      recoveryCode: mfaRequired && useRecoveryCode ? recoveryCode : undefined,
      redirect: false,
      callbackUrl,
    });

    setLoading(false);

    if (result?.code === "mfa-required") {
      setMfaRequired(true);
      return;
    }
    if (!result || result.error) {
      setError(mfaRequired ? "Código inválido." : "E-mail ou senha inválidos.");
      return;
    }
    window.location.href = result.url ?? callbackUrl;
  };

  const handleBackToPassword = () => {
    setMfaRequired(false);
    setUseRecoveryCode(false);
    setTotpCode("");
    setRecoveryCode("");
    setError(null);
  };

  return (
    <div data-theme-surface className="flex min-h-dvh bg-[var(--color-surface-muted)]">
      {/* Painel de marca — só desktop (>=1024px); no mobile só o card do formulário. */}
      <div
        className="hidden w-1/2 flex-col justify-center gap-8 px-12 py-10 text-white lg:flex"
        style={{ background: "linear-gradient(135deg, #3b5bd9, #4f46e5, #6366f1)" }}
      >
        <div className="flex items-center gap-2">
          <Image src="/icon-one.png" alt="" width={32} height={32} className="rounded-full" unoptimized />
          <span className="font-heading text-lg font-semibold">AvaliaSmart</span>
        </div>
        <div>
          <h2 className="font-heading max-w-md text-3xl leading-tight font-bold">
            Gestão de notas escolares, com uma assistente de IA que entende o contexto pedagógico.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-white/80">
            Lançamento de notas, frequência, boletim em PDF e análise de desempenho — tudo num só lugar.
          </p>
        </div>
        <div className="flex gap-8">
          <div>
            <p className="font-heading text-2xl font-bold">4.2k+</p>
            <p className="text-xs text-white/70">professores</p>
          </div>
          <div>
            <p className="font-heading text-2xl font-bold">120k+</p>
            <p className="text-xs text-white/70">boletins gerados</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4">
      <AnimatedCard
        className="brand-glow w-full max-w-sm rounded-lg border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Image src="/logo-principal.png" alt="AvaliaSmart" width={40} height={34} className="h-9 w-auto" priority />
          <h1 className="font-heading text-lg font-semibold text-[var(--color-foreground)]">Entrar no AvaliaSmart</h1>
          <p className="text-xs text-[var(--color-foreground-muted)]">Gestão de notas para professores</p>
        </div>

        {!mfaRequired ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                disabled={loading}
                className="input-field h-10 w-full rounded-md px-3 text-sm"
              />
              <PasswordInput
                placeholder="Senha"
                value={password}
                onChange={setPassword}
                required
                autoComplete="current-password"
                disabled={loading}
              />
              {error && <p className="text-xs text-rose-500">{error}</p>}
              <Button type="submit" variant="gradient" disabled={loading} className="w-full justify-center">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <OneIcon status="thinking" size={16} label="Entrando" />
                    Entrando…
                  </span>
                ) : (
                  "Entrar"
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
              disabled={loading}
              className="w-full justify-center"
            >
              Continuar com Google
            </Button>

            <p className="mt-4 text-center text-xs">
              <Link href="/esqueci-senha" className="text-brand hover:underline">
                Esqueci minha senha
              </Link>
            </p>
            <p className="mt-2 text-center text-xs text-[var(--color-foreground-muted)]">
              Não tem conta?{" "}
              <Link href="/registrar" className="text-brand hover:underline">
                Criar conta
              </Link>
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-center text-sm text-[var(--color-foreground-muted)]">
              {useRecoveryCode
                ? "Digite um dos seus códigos de recuperação."
                : "Digite o código de 6 dígitos do seu app autenticador."}
            </p>
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
            <Button type="submit" variant="gradient" disabled={loading} className="w-full justify-center">
              {loading ? "Verificando…" : "Verificar"}
            </Button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={handleBackToPassword}
                className="text-[var(--color-foreground-muted)] hover:underline"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => setUseRecoveryCode((v) => !v)}
                className="text-brand hover:underline"
              >
                {useRecoveryCode ? "Usar código do app" : "Usar código de recuperação"}
              </button>
            </div>
          </form>
        )}
      </AnimatedCard>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
