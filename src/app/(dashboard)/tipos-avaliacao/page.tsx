import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEvaluationTypes } from "@/services/evaluation-type.service";
import { EvaluationTypeManager } from "@/components/avaliacoes/EvaluationTypeManager";

/**
 * `/tipos-avaliacao` — gerencia os Tipos de avaliação do tenant (Prova,
 * Trabalho, Seminário...), antes um enum fixo no código, agora editável
 * por workspace (ver EvaluationTypeOption no schema). Usado pelo wizard
 * "Nova avaliação" (Etapa 1, Tipo).
 */
export default async function TiposAvaliacaoPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  const types = await getEvaluationTypes(user.tenantId, true);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
      <h1 className="mb-1 text-lg font-semibold text-[var(--color-foreground)]">Tipos de avaliação</h1>
      <p className="mb-6 text-sm text-[var(--color-foreground-muted)]">
        Adicione, renomeie ou desative os tipos usados no wizard &quot;Nova avaliação&quot;. Um tipo já usado em
        alguma avaliação não pode ser excluído — desative-o em vez disso.
      </p>

      <EvaluationTypeManager
        initialTypes={types.map((t) => ({ id: t.id, name: t.name, active: t.active }))}
      />
    </div>
  );
}
