import type { ReactNode } from "react";
import { PageTransition } from "@/components/motion/PageTransition";

/**
 * `template.tsx` (não `layout.tsx` de propósito) — Next.js remonta este
 * arquivo em toda navegação dentro de `(dashboard)`, o que é o que dá vida
 * à transição de entrada de `<PageTransition>` a cada troca de página
 * (dashboard, chat, configurações, etc., conforme essas telas forem
 * existindo). Nenhuma lógica além da transição deve morar aqui — estado
 * compartilhado entre páginas continua sendo responsabilidade de um
 * `layout.tsx`, se um dia existir um pra este grupo de rotas.
 */
export default function DashboardTemplate({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
