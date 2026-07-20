import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getObservationTemplates } from "@/services/observation-template.service";
import { ObservationTemplateManager } from "@/components/turmas/ObservationTemplateManager";

/**
 * `/observacoes` — banco de observações reutilizáveis. Alimentado tanto
 * manualmente aqui quanto via "salvar como modelo" nas sugestões de IA
 * geradas na tela de notas (ver ObservationSuggestionModal).
 */
export default async function ObservacoesPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  const templates = await getObservationTemplates(user.tenantId);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
      <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Observações reutilizáveis</h1>
      <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">
        Modelos de observação de boletim pra reusar em alunos parecidos, escritos à mão ou salvos de sugestões da IA.
      </p>

      <ObservationTemplateManager
        initialTemplates={templates.map((t) => ({ id: t.id, text: t.text, createdAt: t.createdAt.toISOString() }))}
      />
    </div>
  );
}
