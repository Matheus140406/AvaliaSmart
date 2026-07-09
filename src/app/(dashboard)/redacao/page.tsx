import { EssayModeSwitcher } from "@/components/essay/EssayModeSwitcher";

/**
 * `/redacao` — híbrida: caminho com IA (nota sugerida, feedback por
 * competência) ou manual (professor lê e atribui a nota ele mesmo). Os dois
 * alimentam o mesmo histórico (`AiEssayGrading`, filtrado por `studentLabel`).
 */
export default function RedacaoPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Correção de redação</h1>
      <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">
        Envie o texto ou uma foto da redação — por IA (nota sugerida) ou manual (você atribui a nota).
      </p>
      <EssayModeSwitcher />
    </main>
  );
}
