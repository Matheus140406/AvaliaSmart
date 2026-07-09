"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion } from "motion/react";
import { fadeSlideUp, fadeSlideUpItem, staggerContainer, TRANSITION_MICRO } from "@/lib/motion";

/**
 * Entrada padrão de um card de resultado (prova, flashcards, plano de
 * aula, resumo de IA, comprovante...): fade + slide sutil de baixo pra
 * cima, nunca "piscando" na tela pronto. Use isto sempre que um card
 * aparecer depois de um carregamento assíncrono.
 *
 * `hover` (opt-in, default off pra não mudar nenhum uso existente): leve
 * elevação + escala no hover/tap, mesmo padrão já usado em cards clicáveis
 * soltos pelo app (ex: `ShortcutCard` do dashboard) — centralizado aqui
 * pra card que precisa disso não reimplementar o efeito cru toda vez
 * (achado reproduzindo a tela de Planos: os cards de plano não tinham
 * NENHUM feedback de hover, porque `AnimatedCard` nunca teve essa opção).
 */
export function AnimatedCard({
  children,
  className,
  style,
  hover,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  hover?: boolean;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeSlideUp}
      whileHover={hover ? { y: -3, boxShadow: "0 8px 20px -8px rgba(0,0,0,0.25)" } : undefined}
      whileTap={hover ? { y: 0 } : undefined}
      transition={TRANSITION_MICRO}
      className={className}
      style={style}
      data-theme-surface
    >
      {children}
    </motion.div>
  );
}

/**
 * Mesma entrada, mas para uma LISTA de itens que devem aparecer em
 * sequência rápida (stagger), não todos de uma vez — ex: as 5 questões de
 * múltipla escolha de uma prova gerada, os cards de um conjunto de
 * flashcards.
 */
export function AnimatedList({
  children,
  className,
  style,
  staggerChildren = 0.06,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  staggerChildren?: number;
  [key: `data-${string}`]: string | boolean | undefined;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer(staggerChildren)}
      className={className}
      style={style}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Item individual de dentro de um `<AnimatedList>` — precisa ser filho direto pra herdar o stagger. */
export function AnimatedListItem({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.div variants={fadeSlideUpItem} className={className} style={style} data-theme-surface>
      {children}
    </motion.div>
  );
}
