"use client";

import { motion } from "motion/react";
import { TRANSITION_MICRO, buttonTap, buttonHover } from "@/lib/motion";

/**
 * Reconstruído depois de uma sobrescrita acidental (init do shadcn/ui criou
 * um `button.tsx` que colidiu com o `Button.tsx` original num filesystem
 * case-insensitive). Renomeado pra minúsculo de propósito — vira o único
 * arquivo com esse nome (evita a mesma colisão de novo) e passa a ser
 * também o `Button` que os componentes internos do shadcn (Sheet, Dialog,
 * futuros) importam via `@/components/ui/button`, daí `size` e `variant:
 * "outline"` abaixo além dos 4 usados pelo resto do app.
 *
 * Mesmo visual/microinteração do `<LinkButton>` (ver ui/LinkButton.tsx).
 * "gradient" só existe aqui de propósito (ver `--gradient-cta` em
 * globals.css): exceção pro CTA principal, não um padrão de navegação.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "gradient" | "outline";
export type ButtonSize = "default" | "icon" | "icon-sm";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white",
  secondary: "bg-[var(--color-surface-raised)] text-[var(--color-foreground)] border border-[var(--color-border)]",
  ghost: "bg-transparent text-[var(--color-foreground)] hover:bg-[var(--color-surface-muted)]",
  gradient: "text-white bg-[image:var(--gradient-cta)]",
  outline: "bg-transparent text-[var(--color-foreground)] border border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  default: "px-3 py-2 text-sm rounded-md",
  icon: "size-9 p-0 rounded-md",
  "icon-sm": "size-7 p-0 rounded-md",
};

/** Omite os handlers de drag/animation nativos — colidem com a assinatura própria do Framer Motion pra esses mesmos eventos. Não usados em nenhum call site atual. */
type NativeButtonPropsSafe = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onDragEnter" | "onDragExit" | "onDragLeave" | "onDragOver" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
>;

export interface ButtonProps extends NativeButtonPropsSafe {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "primary", size = "default", className, disabled, children, ...props }: ButtonProps) {
  return (
    <motion.button
      whileHover={disabled ? undefined : buttonHover}
      whileTap={disabled ? undefined : buttonTap}
      transition={TRANSITION_MICRO}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center font-medium disabled:pointer-events-none disabled:opacity-50",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </motion.button>
  );
}
