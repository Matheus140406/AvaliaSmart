"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { TRANSITION_STATE, TRANSITION_ENTER } from "@/lib/motion";

export type ModalVariant = "center" | "drawer";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /**
   * "center": diálogo curto, ação única e previsível (confirmar, um
   * campo). "drawer": fluxo com múltiplos passos ou lista que cresce (ex:
   * form de turma + cadastro de alunos um a um) — um painel fixo de altura
   * de tela não precisa recentralizar a cada item novo, diferente de um
   * modal centralizado que "pula" verticalmente conforme o conteúdo cresce.
   */
  variant?: ModalVariant;
}

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: TRANSITION_STATE },
};

// `TRANSITION_ENTER` (lib/motion.ts) — panel aparecendo é "entrada de
// elemento na tela", mesma categoria/timing usada em toda entrada de card
// do produto; antes usava durações soltas (0.25/0.3) só pra este
// componente, fora do que Etapa 6 pede pra evitar.
const centerPanelVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: TRANSITION_ENTER },
};

const drawerPanelVariants = {
  hidden: { x: "100%" },
  visible: { x: 0, transition: TRANSITION_ENTER },
};

/**
 * `<Modal>` reutilizável — não existia nenhum overlay no projeto antes
 * desta rodada; "Nova turma" vivia espremido inline na própria página de
 * `/turmas`. Fecha por: botão ×, clique no backdrop, ou Esc.
 *
 * `createPortal` pro `document.body`: evita que o overlay herde
 * `overflow`/`position` de algum ancestral (ex: o `min-h-0 flex-1` da
 * cadeia de altura do chat) e fique cortado ou mal posicionado.
 */
export function Modal({ open, onClose, title, children, variant = "center" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={backdropVariants}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/50"
        >
          <motion.div
            key="panel"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={variant === "drawer" ? drawerPanelVariants : centerPanelVariants}
            onClick={(e) => e.stopPropagation()}
            data-theme-surface
            className={
              variant === "drawer"
                ? "fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l shadow-xl"
                : "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border shadow-xl"
            }
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
          >
            <div
              data-theme-surface
              className="flex shrink-0 items-center justify-between border-b px-4 py-3"
              style={{ borderColor: "var(--color-border)" }}
            >
              <p className="text-sm font-semibold text-[var(--color-foreground)]">{title}</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                <X size={16} />
              </button>
            </div>
            <div className={variant === "drawer" ? "min-h-0 flex-1 overflow-y-auto p-4" : "max-h-[80vh] overflow-y-auto p-4"}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
