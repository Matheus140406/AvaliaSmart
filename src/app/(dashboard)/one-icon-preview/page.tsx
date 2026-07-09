import { OneIcon } from "@/components/one/OneIcon";
import { ChatCard } from "@/components/chat/ChatCard";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { AnimatedCard, AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";
import { Button } from "@/components/ui/button";

/**
 * Página de preview manual — não faz parte do produto, existe só pra você
 * abrir no navegador e conferir com os próprios olhos o que eu não tenho
 * como ver daqui (animação rodando, contraste no dark mode, transição de
 * tema). Cobre: OneIcon nos 3 estados, troca de tema, skeleton, entrada
 * animada de card (com e sem stagger), botão com microinteração, e o
 * ChatCard com o ciclo real contra o endpoint de IA. Pode apagar depois de
 * validar, ou manter como galeria de referência de componentes.
 */
export default function OneIconPreviewPage() {
  return (
    <div data-theme-surface className="flex min-h-screen flex-col gap-10 bg-[var(--color-surface-muted)] p-10">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--color-foreground)]">Galeria de componentes — animação & tema</h1>
        <ThemeToggle />
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-[var(--color-foreground-muted)]">OneIcon — os 3 estados</h2>
        <div className="flex items-center gap-10">
          <div className="flex flex-col items-center gap-2">
            <OneIcon status="idle" size={64} />
            <span className="text-xs text-[var(--color-foreground-muted)]">idle</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <OneIcon status="thinking" size={64} />
            <span className="text-xs text-[var(--color-foreground-muted)]">thinking</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <OneIcon status="done" size={64} />
            <span className="text-xs text-[var(--color-foreground-muted)]">done (pulse único ao montar)</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-[var(--color-foreground-muted)]">Botão (hover/tap)</h2>
        <div className="flex gap-3">
          <Button variant="primary">Primário</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" disabled>
            Desabilitado
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-[var(--color-foreground-muted)]">Skeleton (shimmer)</h2>
        <div data-theme-surface className="max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center gap-3">
            <Skeleton style={{ width: 40, height: 40, borderRadius: 999 }} />
            <SkeletonText lines={2} className="flex-1" />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-[var(--color-foreground-muted)]">
          Entrada animada de card (ex: resultado de gerador de provas)
        </h2>
        <AnimatedCard
          className="max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-foreground)]"
        >
          Este card entra com fade + slide-up ao montar — mesma curva/duração de todo o app.
        </AnimatedCard>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-[var(--color-foreground-muted)]">
          Lista com stagger (ex: questões de uma prova gerada)
        </h2>
        <AnimatedList className="flex max-w-sm flex-col gap-2">
          {["Questão 1", "Questão 2", "Questão 3"].map((q) => (
            <AnimatedListItem
              key={q}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-foreground)]"
            >
              {q}
            </AnimatedListItem>
          ))}
        </AnimatedList>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-[var(--color-foreground-muted)]">Card de chat (ciclo real)</h2>
        <ChatCard />
      </section>
    </div>
  );
}
