"use client";

import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Skeleton com shimmer sutil — substitui spinner genérico em qualquer
 * dado assíncrono (gráficos do dashboard, lista de comprovantes, etc.).
 * Respeita `prefers-reduced-motion` sozinho (via `useReducedMotion`, não
 * depende só do `MotionConfig` global): sem a preferência, mostra só o
 * bloco estático na cor de superfície — nada de brilho varrendo a tela.
 */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      aria-hidden
      data-theme-surface
      className={["rounded-lg", className].filter(Boolean).join(" ")}
      style={{
        backgroundColor: "var(--color-surface-muted)",
        backgroundImage: prefersReducedMotion
          ? undefined
          : "linear-gradient(90deg, transparent, var(--color-border), transparent)",
        backgroundSize: "200% 100%",
        ...style,
      }}
      animate={prefersReducedMotion ? undefined : { backgroundPositionX: ["150%", "-50%"] }}
      transition={prefersReducedMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: "linear" }}
    />
  );
}

/** Atalho pra um bloco de texto skeleton (1 ou mais linhas, largura variável na última). */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} style={{ height: 12, width: i === lines - 1 ? "60%" : "100%" }} />
      ))}
    </div>
  );
}
