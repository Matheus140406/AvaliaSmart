"use client";

import { motion } from "motion/react";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";
import { SkeletonText } from "@/components/ui/Skeleton";
import { TRANSITION_MICRO } from "@/lib/motion";

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ChatSidebar({
  conversations,
  activeConversationId,
  onSelect,
  onNew,
  onDelete,
  loading,
}: {
  conversations: ConversationSummary[] | null;
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div
      data-theme-surface
      className="flex h-full w-full flex-col gap-3 border-r p-3"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
    >
      <Button variant="secondary" onClick={onNew} className="w-full justify-center">
        <Plus size={15} className="mr-1.5 inline-block align-[-2px]" />
        Nova Conversa
      </Button>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations === null ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2].map((i) => (
              <SkeletonText key={i} lines={1} />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-1 text-xs text-[var(--color-foreground-muted)]">Nenhuma conversa ainda.</p>
        ) : (
          <AnimatedList className="space-y-1" staggerChildren={0.03}>
            {conversations.map((c) => {
              const isActive = c.id === activeConversationId;
              return (
                <AnimatedListItem key={c.id}>
                  <motion.button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    whileHover="hover"
                    initial="rest"
                    animate="rest"
                    className="group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left"
                    style={{ backgroundColor: isActive ? "var(--color-surface-muted)" : "transparent" }}
                  >
                    <MessageSquare size={15} className="shrink-0 text-[var(--color-foreground-muted)]" />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-xs font-medium"
                        style={{ color: isActive ? "var(--color-brand)" : "var(--color-foreground)" }}
                      >
                        {c.title}
                      </span>
                      <span className="block text-[10px] text-[var(--color-foreground-muted)]">
                        {formatRelativeDate(c.updatedAt)}
                      </span>
                    </span>
                    <motion.span
                      variants={{ rest: { opacity: 0 }, hover: { opacity: 1 } }}
                      transition={TRANSITION_MICRO}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c.id);
                      }}
                      role="button"
                      aria-label="Apagar conversa"
                      title="Apagar conversa"
                      className="shrink-0 rounded p-1 text-[var(--color-foreground-muted)] hover:bg-[var(--color-surface-raised)] hover:text-rose-500"
                    >
                      <Trash2 size={13} />
                    </motion.span>
                  </motion.button>
                </AnimatedListItem>
              );
            })}
          </AnimatedList>
        )}
      </div>
    </div>
  );
}
