"use client";

/**
 * Landing do link de convite (e-mail via workspaceInviteEmail, ver
 * lib/email/resend.ts). Três estados possíveis:
 *  1. Sem sessão -> oferece login/cadastro, preservando esta URL (com o
 *     token) como `callbackUrl` — quem ainda não tem conta não perde o
 *     convite no meio do cadastro.
 *  2. Sessão presente -> chama o accept automaticamente ao montar.
 *  3. Erro (token inválido/expirado/e-mail errado) -> mensagem clara.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { AnimatedCard } from "@/components/motion/AnimatedCard";
import { OneIcon } from "@/components/one/OneIcon";
import { LinkButton } from "@/components/ui/LinkButton";

type Status = "checking-session" | "no-session" | "accepting" | "success" | "error";

function AceitarConviteInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>("checking-session");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "loading") return;

    if (!token) {
      setStatus("error");
      setError("Link de convite inválido — faltando o token.");
      return;
    }

    if (sessionStatus === "unauthenticated") {
      setStatus("no-session");
      return;
    }

    if (sessionStatus === "authenticated" && status !== "success") {
      setStatus("accepting");
      fetch("/api/workspaces/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then(async (response) => {
          const body = await response.json().catch(() => ({ success: false }));
          if (!response.ok || !body.success) {
            throw new Error(body.error ?? "Não foi possível aceitar o convite.");
          }
          setStatus("success");
          setTimeout(() => router.replace("/workspaces"), 1200);
        })
        .catch((err) => {
          setStatus("error");
          setError(err instanceof Error ? err.message : "Não foi possível aceitar o convite.");
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, token]);

  const currentUrl = token ? `/convite/aceitar?token=${encodeURIComponent(token)}` : "/convite/aceitar";
  const isBusy = status === "checking-session" || status === "accepting";

  return (
    <div data-theme-surface className="flex min-h-dvh items-center justify-center bg-[var(--color-surface-muted)] px-4">
      <AnimatedCard
        className="w-full max-w-sm rounded-lg border p-6 text-center"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <div className="mb-4 flex flex-col items-center gap-2">
          <OneIcon status={isBusy ? "thinking" : status === "success" ? "done" : "idle"} size={40} />
        </div>

        <h1 className="mb-4 text-lg font-semibold text-[var(--color-foreground)]">Convite para o AvaliaSmart</h1>

        {isBusy && <p className="text-sm text-[var(--color-foreground-muted)]">Verificando convite…</p>}

        {status === "no-session" && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-foreground)]">
              Entre com sua conta (o mesmo e-mail que recebeu o convite) para continuar.
            </p>
            <LinkButton href={`/login?callbackUrl=${encodeURIComponent(currentUrl)}`} className="w-full">
              Entrar
            </LinkButton>
            <LinkButton
              href={`/registrar?callbackUrl=${encodeURIComponent(currentUrl)}`}
              variant="secondary"
              className="w-full"
            >
              Criar conta
            </LinkButton>
          </div>
        )}

        {status === "success" && <p className="text-sm text-[var(--color-accent)]">Convite aceito! Redirecionando…</p>}

        {status === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-rose-500">{error}</p>
            <Link href="/workspaces" className="text-sm text-brand hover:underline">
              Ir para meus workspaces
            </Link>
          </div>
        )}

        {session?.user?.email && status !== "success" && (
          <p className="mt-6 text-xs text-[var(--color-foreground-muted)]">Entrou como {session.user.email}</p>
        )}
      </AnimatedCard>
    </div>
  );
}

export default function AceitarConvitePage() {
  return (
    <Suspense fallback={null}>
      <AceitarConviteInner />
    </Suspense>
  );
}
