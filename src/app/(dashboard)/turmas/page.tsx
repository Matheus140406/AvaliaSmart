import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TurmasList } from "@/components/dashboard/TurmasList";

/**
 * Lista de turmas do tenant ativo — não existia nenhuma página de
 * listagem antes (só a rota aninhada `[classId]/notas/[subjectId]`, que já
 * exige saber os IDs de antemão). Esta é a origem: cada card leva pra essa
 * rota existente.
 */
export default async function TurmasPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="mb-6 text-lg font-semibold text-[var(--color-foreground)]">Turmas</h1>
      <TurmasList />
    </main>
  );
}
