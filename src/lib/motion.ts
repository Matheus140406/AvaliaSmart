import type { Transition, Variants } from "motion/react";

/**
 * Fonte única de verdade pra timing/curva de animação do produto — todo
 * componente animado importa DAQUI em vez de repetir duração/easing "mágicos".
 * Isso é o que garante que o app inteiro sinta a MESMA "física" (Linear/
 * Vercel/Notion como referência), mesmo com dezenas de componentes
 * diferentes usando a biblioteca.
 *
 * Framer Motion é o ÚNICO mecanismo de animação do produto — nenhum
 * componente novo deve misturar `transition-*`/`@keyframes` do Tailwind/CSS
 * cru com Framer Motion no mesmo elemento (timing/curva ficariam
 * dessincronizados do resto do app). CSS puro só é aceitável pra coisas que
 * não são "animação de produto" (ex: scrollbar, cursor), nunca pra
 * transição de estado/entrada/microinteração.
 */

/** "ease-out expo" suave — curva única do produto, usada em toda transição. */
export const EASE_STANDARD = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  /** Hover, botão, toggle. */
  micro: 0.18,
  /** Transição de estado dentro de um componente (ex: card resumo -> chat). */
  state: 0.35,
  /** Entrada de elementos na tela (fade+slide ao carregar). */
  enter: 0.45,
} as const;

export const TRANSITION_MICRO: Transition = { duration: DURATION.micro, ease: EASE_STANDARD };
export const TRANSITION_STATE: Transition = { duration: DURATION.state, ease: EASE_STANDARD };
export const TRANSITION_ENTER: Transition = { duration: DURATION.enter, ease: EASE_STANDARD };

/** `prefers-reduced-motion`: reduz pra fade rápido e instantâneo, sem movimento/escala. */
export const TRANSITION_REDUCED: Transition = { duration: 0.1, ease: "linear" };

/**
 * Entrada padrão de elementos na tela: fade + slide sutil de baixo pra
 * cima. Usada pelos cards de resultado de IA (prova, flashcards, plano de
 * aula) e por qualquer elemento que apareça "batendo" na tela.
 */
export const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: TRANSITION_ENTER },
};

/** Igual a `fadeSlideUp`, mas pra usar como filho de um container com `staggerChildren`. */
export const fadeSlideUpItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: TRANSITION_STATE },
};

/** Container de lista/stagger — elementos filhos aparecem em sequência rápida, não tudo de uma vez. */
export function staggerContainer(staggerChildren = 0.06): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren } },
  };
}

/** Microinteração padrão de botão/elemento clicável (hover leve + press tátil). */
export const buttonTap = { scale: 0.97 };
export const buttonHover = { scale: 1.02 };

/** Fade+slide leve de transição de rota (usado em template.tsx). */
export const pageTransitionVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: TRANSITION_ENTER },
  exit: { opacity: 0, y: -8, transition: TRANSITION_STATE },
};
