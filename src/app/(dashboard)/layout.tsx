import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Sidebar } from "@/components/layout/Sidebar";

/**
 * `layout.tsx` (persiste entre navegações) — diferente de `template.tsx`
 * (já existente nesta mesma pasta, remonta a cada navegação pra animar a
 * transição de página). Next.js compõe os dois: `layout > template >
 * page`, então header/sidebar ficam fixos e a transição de `template.tsx`
 * continua funcionando só pro conteúdo de cada página, sem conflito.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme-surface className="flex min-h-dvh bg-[var(--color-surface-muted)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        {children}
      </div>
    </div>
  );
}
