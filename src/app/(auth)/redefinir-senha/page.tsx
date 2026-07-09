"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/motion/AnimatedCard";
import { OneIcon } from "@/components/one/OneIcon";

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme-surface className="flex min-h-dvh items-center justify-center bg-[var(--color-surface-muted)] px-4">
      <AnimatedCard
        className="w-full max-w-sm rounded-lg border p-6 text-center"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <div className="mb-6 flex flex-col items-center gap-2">
          <OneIcon status="idle" size={40} />
        </div>
        {children}
      </AnimatedCard>
    </div>
  );
}

function RedefinirSenhaForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const checks = [
    { ok: password.length >= 8, label: "8+ caracteres" },
    { ok: /[a-zA-Z]/.test(password), label: "uma letra" },
    { ok: /[0-9]/.test(password), label: "um número" },
    { ok: password.length > 0 && password === confirm, label: "senhas iguais" },
  ];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (checks.some((c) => !c.ok)) {
      setError("Confira os requisitos da senha abaixo.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Não foi possível redefinir a senha.");
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Erro de conexão. Tente de novo.");
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <CardShell>
        <p className="text-sm text-rose-500">Link inválido — falta o token.</p>
        <Link href="/esqueci-senha" className="mt-4 inline-block text-sm text-brand hover:underline">
          Pedir um novo link
        </Link>
      </CardShell>
    );
  }

  if (done) {
    return (
      <CardShell>
        <p className="text-sm text-[var(--color-accent)]">Senha redefinida. Você já pode entrar com a nova senha.</p>
        <Link href="/login" className="mt-4 inline-block text-sm text-brand hover:underline">
          Ir para o login
        </Link>
      </CardShell>
    );
  }

  return (
    <CardShell>
      <h1 className="mb-6 text-lg font-semibold text-[var(--color-foreground)]">Criar nova senha</h1>

      <form onSubmit={handleSubmit} className="space-y-3 text-left">
        <input
          type="password"
          placeholder="Nova senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="input-field h-10 w-full rounded-md px-3 text-sm"
        />
        <input
          type="password"
          placeholder="Confirmar nova senha"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="input-field h-10 w-full rounded-md px-3 text-sm"
        />

        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {checks.map((c) => (
            <li
              key={c.label}
              className={`flex items-center gap-1 text-[11px] ${c.ok ? "text-[var(--color-accent)]" : "text-[var(--color-foreground-muted)]"}`}
            >
              {c.ok ? <Check size={12} /> : <Circle size={12} />} {c.label}
            </li>
          ))}
        </ul>

        {error && <p className="text-xs text-rose-500">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full justify-center">
          {loading ? "Salvando…" : "Redefinir senha"}
        </Button>
      </form>
    </CardShell>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={null}>
      <RedefinirSenhaForm />
    </Suspense>
  );
}
