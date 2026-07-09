"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";

/**
 * `<OneAvatar />` — rosto DECORATIVO da marca (sidebar, hero do dashboard,
 * cabeçalho/balões do chat, estado-vazio de Turmas, header do stepper).
 * Diferente do `<OneIcon />` (que existe desde antes e continua em uso no
 * `ChatCard` — aquele é um INDICADOR DE STATUS real: muda de aparência
 * conforme `status="idle"|"thinking"|"done"`). Este aqui não tem estado —
 * só liga/desliga halo (`glow`) e flutuação (`float`) via prop, sempre com
 * a mesma arte parada por baixo.
 */
export interface OneAvatarProps {
  size?: number;
  glow?: boolean;
  float?: boolean;
  className?: string;
}

export function OneAvatar({ size = 40, glow = false, float = false, className }: OneAvatarProps) {
  const prefersReducedMotion = useReducedMotion();
  const animateFloat = float && !prefersReducedMotion;
  const animateGlow = glow && !prefersReducedMotion;

  return (
    <span className={["relative inline-block shrink-0", className].filter(Boolean).join(" ")} style={{ width: size, height: size }}>
      {glow && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(var(--color-one-rgb), 0.55), transparent 70%)",
            filter: "blur(3px)",
          }}
          initial={{ scale: 1, opacity: 0.55 }}
          animate={animateGlow ? { scale: [1, 1.08, 1], opacity: [0.55, 0.9, 0.55] } : { scale: 1.04, opacity: 0.7 }}
          transition={animateGlow ? { duration: 3.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
        />
      )}
      <motion.span
        className="relative flex items-center justify-center overflow-hidden rounded-full"
        style={{
          width: size,
          height: size,
          backgroundColor: "#eef7fc",
          boxShadow: "0 0 0 1px rgba(108, 200, 240, 0.4)",
        }}
        animate={animateFloat ? { y: [0, -6, 0] } : { y: 0 }}
        transition={animateFloat ? { duration: 5, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
      >
        <Image src="/icon-one.png" alt="" width={size} height={size} style={{ objectFit: "cover" }} unoptimized />
      </motion.span>
    </span>
  );
}
