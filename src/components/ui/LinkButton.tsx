import Link from "next/link";
import { motion } from "motion/react";
import { TRANSITION_MICRO, buttonTap, buttonHover } from "@/lib/motion";

/** Sem "gradient" de propósito — essa exceção é só pro CTA principal (um `<button type="submit">` de verdade), não navegação. */
export type LinkButtonVariant = "primary" | "secondary" | "ghost";

const VARIANT_CLASSES: Record<LinkButtonVariant, string> = {
  primary: "bg-brand text-white",
  secondary: "bg-[var(--color-surface-raised)] text-[var(--color-foreground)] border border-[var(--color-border)]",
  ghost: "bg-transparent text-[var(--color-foreground)] hover:bg-[var(--color-surface-muted)]",
};

const MotionLink = motion.create(Link);

export interface LinkButtonProps {
  href: string;
  variant?: LinkButtonVariant;
  className?: string;
  children: React.ReactNode;
}

/**
 * Mesmo visual/microinteração do `<Button>`, mas pra NAVEGAÇÃO real (link
 * pra outra rota) — usa `<Link>` de verdade por baixo (`motion.create`),
 * não `onClick + router.push`, pra manter comportamento nativo de link
 * (abrir em nova aba, prefetch, crawler). Use isto sempre que o "botão" da
 * tela na verdade for ir pra outra página.
 */
export function LinkButton({ href, variant = "primary", className, children }: LinkButtonProps) {
  return (
    <MotionLink
      href={href}
      whileHover={buttonHover}
      whileTap={buttonTap}
      transition={TRANSITION_MICRO}
      className={[
        "block rounded-md px-3 py-2 text-center text-sm font-medium",
        VARIANT_CLASSES[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </MotionLink>
  );
}
