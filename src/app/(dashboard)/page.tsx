import { redirect } from "next/navigation";
import { auth, getCurrentUser } from "@/lib/auth";
import { OneIcon } from "@/components/one/OneIcon";
import { PainelDashboard } from "@/components/dashboard/PainelDashboard";
import { ShareWhatsAppButton } from "@/components/export/ShareWhatsAppButton";

/**
 * Destino canônico pós-login/pós-seleção de workspace — agora É o painel do
 * professor (antes era um hub simples com 2 links; os mesmos 2 links
 * continuam presentes, como atalhos dentro do painel, ver
 * `PainelDashboard.tsx`). Nenhuma regra de negócio mora aqui — só o guard de
 * sessão/workspace e o cabeçalho de boas-vindas; os dados de verdade vêm de
 * `GET /api/dashboard/summary` (busca no client, com Skeleton enquanto
 * carrega — ver PainelDashboard).
 */
export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await getCurrentUser();
  if (!user) redirect("/workspaces");

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <OneIcon status="idle" size={40} />
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-foreground)]">Painel do professor</h1>
            <p className="text-sm text-[var(--color-foreground-muted)]">Visão geral das suas turmas</p>
          </div>
        </div>

        {/* Baixar PDF já existia como rota (`/api/export/pdf/dashboard`) mas
            nunca tinha sido ligado a um botão na tela — ambos entram juntos
            agora, pra não deixar a UI assimétrica (Excel funcionando, PDF
            não aparecendo em lugar nenhum). */}
        <div className="flex flex-wrap gap-3 text-xs font-medium">
          <a
            href="/api/export/pdf/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            data-theme-surface
            className="rounded-md border px-3 py-2 text-[var(--color-foreground)] hover:border-brand"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
          >
            Baixar PDF
          </a>
          <ShareWhatsAppButton kind="dashboard-pdf" />
          <a
            href="/api/export/excel/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            data-theme-surface
            className="rounded-md border px-3 py-2 text-[var(--color-foreground)] hover:border-brand"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
          >
            Baixar Excel
          </a>
          <ShareWhatsAppButton kind="dashboard-excel" />
        </div>
      </div>

      <PainelDashboard />
    </main>
  );
}
