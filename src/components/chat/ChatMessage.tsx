"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Copy, Check, RotateCcw, Pencil, Trash2 } from "lucide-react";
import { OneAvatar } from "@/components/one/OneAvatar";
import { TRANSITION_MICRO } from "@/lib/motion";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Só true pra mensagem que acabou de chegar nesta sessão — dispara o efeito de digitação; histórico carregado aparece pronto, sem re-simular. */
  isNew?: boolean;
}

const TYPEWRITER_CHARS_PER_TICK = 3;
const TYPEWRITER_TICK_MS = 12;

function useTypewriter(fullText: string, enabled: boolean) {
  const [displayed, setDisplayed] = useState(enabled ? "" : fullText);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(fullText);
      return;
    }
    let i = 0;
    setDisplayed("");
    const interval = setInterval(() => {
      i += TYPEWRITER_CHARS_PER_TICK;
      setDisplayed(fullText.slice(0, i));
      if (i >= fullText.length) clearInterval(interval);
    }, TYPEWRITER_TICK_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullText]);

  return displayed;
}

/**
 * Barra de ações flutuante — SEM `whileHover`/`initial`/`animate` próprios
 * de propósito: herda o estado "rest"/"hover" do pai (a linha da mensagem,
 * que tem `whileHover="hover"`) via propagação de variants do Motion. É
 * assim que dá pra reagir ao hover do BLOCO inteiro (o "group-hover" do
 * pedido) sem misturar `group-hover:` de CSS com Framer Motion no mesmo
 * elemento.
 */
function HoverActionBar({ actions, align }: { actions: React.ReactNode; align: "left" | "right" }) {
  return (
    <motion.div
      initial="rest"
      animate="rest"
      variants={{ rest: { opacity: 0, y: 4, pointerEvents: "none" }, hover: { opacity: 1, y: 0, pointerEvents: "auto" } }}
      className={`absolute -top-3 flex gap-0.5 rounded-md border p-0.5 shadow-sm ${align === "right" ? "right-2" : "left-2"}`}
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      transition={TRANSITION_MICRO}
    >
      {actions}
    </motion.div>
  );
}

function ActionIconButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      transition={TRANSITION_MICRO}
      className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-foreground)]"
    >
      {children}
    </motion.button>
  );
}

export function ChatMessage({
  message,
  onDelete,
  onEdit,
  onRegenerate,
}: {
  message: ChatMessageData;
  onDelete: (id: string) => void;
  onEdit: (id: string, content: string) => void;
  onRegenerate: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isUser = message.role === "user";
  const displayedText = useTypewriter(message.content, Boolean(message.isNew) && message.role === "assistant");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDelete = () => {
    setDeleting(true);
    // A animação de saída (AnimatePresence, ver ChatCard) cuida do
    // fade+colapso — só avisa o pai depois de já ter disparado o "exit"
    // localmente, pra nunca sumir instantâneo antes da animação rodar.
    setTimeout(() => onDelete(message.id), TRANSITION_MICRO.duration! * 1000);
  };

  return (
    <AnimatePresence>
      {!deleting && (
        <motion.div
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          whileHover="hover"
          transition={TRANSITION_MICRO}
          className={`relative flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
        >
          {!isUser && (
            <div className="shrink-0 pt-0.5">
              <OneAvatar size={24} />
            </div>
          )}

          <div className={`relative max-w-[75%] ${isUser ? "" : "flex-1"}`}>
            <HoverActionBar
              align={isUser ? "right" : "left"}
              actions={
                isUser ? (
                  <>
                    <ActionIconButton onClick={() => onEdit(message.id, message.content)} label="Editar mensagem">
                      <Pencil size={13} />
                    </ActionIconButton>
                    <ActionIconButton onClick={handleDelete} label="Apagar mensagem">
                      <Trash2 size={13} />
                    </ActionIconButton>
                  </>
                ) : (
                  <>
                    <ActionIconButton onClick={handleCopy} label={copied ? "Copiado!" : "Copiar texto"}>
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                    </ActionIconButton>
                    <ActionIconButton onClick={() => onRegenerate(message.id)} label="Regenerar resposta">
                      <RotateCcw size={13} />
                    </ActionIconButton>
                  </>
                )
              }
            />

            <div
              className={isUser ? "rounded-2xl px-4 py-2.5 text-sm" : "rounded-2xl border px-3.5 py-2.5 text-sm"}
              style={
                isUser
                  ? { background: "var(--gradient-cta)", color: "white" }
                  : { backgroundColor: "#171b25", borderColor: "#232838", color: "var(--color-foreground)" }
              }
            >
              {displayedText}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
