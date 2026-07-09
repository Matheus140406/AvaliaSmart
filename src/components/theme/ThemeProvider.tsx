"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Wrapper fino do `next-themes` — resolve os 3 requisitos do tema de uma
 * vez, sem reinventar nada:
 * - `attribute="class"`: alterna a classe `.dark` em <html>, que é o que
 *   `@custom-variant dark` (globals.css) e as variáveis de tema esperam.
 * - `defaultTheme="system"` + `enableSystem`: se o usuário nunca escolheu
 *   manualmente, segue `prefers-color-scheme` do SO.
 * - Persistência em localStorage é automática (next-themes já faz isso —
 *   não precisa de código extra) e a leitura inicial acontece via um
 *   script inline injetado antes da hidratação (evita flash de tema
 *   errado no primeiro paint).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange={false}>
      {children}
    </NextThemesProvider>
  );
}
