import { AssessmentStepper } from "@/components/avaliacoes/AssessmentStepper";

export default function NovaAvaliacaoPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-8">
      <h1 className="font-heading mb-1 text-lg font-semibold text-[var(--color-foreground)]">Nova avaliação</h1>
      <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">Configure uma avaliação em 4 passos.</p>
      <AssessmentStepper />
    </main>
  );
}
