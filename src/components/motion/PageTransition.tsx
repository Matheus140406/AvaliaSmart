"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { pageTransitionVariants } from "@/lib/motion";

/**
 * Fade+slide leve entre rotas. Usado dentro de `template.tsx` (não
 * `layout.tsx`): `template.tsx` remonta a cada navegação, então o `initial`
 * roda de novo em toda troca de página — é exatamente esse remount que faz
 * a transição de rota existir (um `layout.tsx` persiste entre navegações e
 * nunca dispararia o `initial`).
 *
 * `flex flex-1 min-h-0 flex-col`: sem isso, este wrapper só ocupa a altura
 * do próprio conteúdo mesmo com o shell de `(dashboard)/layout.tsx` tendo
 * altura de tela cheia disponível — era a causa raiz da página de chat
 * aparecer como um card pequeno em vez de ocupar a altura útil da tela
 * (páginas com conteúdo mais curto que a tela não mudam de aparência; só
 * passam a ter esse wrapper "invisível" preenchendo o espaço sobrando).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div initial="hidden" animate="visible" variants={pageTransitionVariants} className="flex min-h-0 flex-1 flex-col">
      {children}
    </motion.div>
  );
}
