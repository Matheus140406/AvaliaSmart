"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { EASE_STANDARD } from "@/lib/motion";

/**
 * Ponto único de configuração global do Framer Motion — dois efeitos, um
 * import:
 *
 * 1. `reducedMotion="user"`: respeita `prefers-reduced-motion` do SO pra
 *    TODA animação Framer Motion do app automaticamente (transform/scale/
 *    layout viram instantâneas; opacidade continua podendo suavizar) —
 *    nenhum componente precisa checar a media query na mão.
 * 2. `transition={{ ease: EASE_STANDARD }}`: curva padrão herdada por
 *    qualquer `motion.*` que não especifique a própria — reforça a mesma
 *    "física" em todo canto sem precisar repetir a curva em cada
 *    componente (quem quiser sobrescrever duração/curva ainda pode, via
 *    prop `transition` local).
 */
export function MotionConfigProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ ease: EASE_STANDARD }}>
      {children}
    </MotionConfig>
  );
}
