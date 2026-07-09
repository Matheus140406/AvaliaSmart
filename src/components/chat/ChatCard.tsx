"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FileQuestion, GraduationCap, Paperclip, Send, PanelLeft } from "lucide-react";
import type { OneIconStatus } from "@/components/one/OneIcon";
import { OneAvatar } from "@/components/one/OneAvatar";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/LinkButton";
import { Modal } from "@/components/ui/Modal";
import { fadeSlideUpItem } from "@/lib/motion";
import { ChatMessage, type ChatMessageData } from "@/components/chat/ChatMessage";
import { ChatSidebar, type ConversationSummary } from "@/components/chat/ChatSidebar";

/**
 * Card de chat com a One — consome `/api/ai/chat` de verdade (nenhum mock).
 *
 * Reescrita completa desta rodada: conversas nomeadas (sidebar, ver
 * `ChatSidebar`), mensagens com ações de hover (copiar/regenerar na IA,
 * editar/apagar no usuário — ver `ChatMessage`), efeito de digitação na
 * resposta nova, textarea que cresce sozinha, e anexo (ícone só, upload de
 * verdade fica pra quando o contexto de OCR entrar aqui — "futuro" no
 * pedido original).
 *
 * Duas falhas tratadas de forma DIFERENTE de propósito, herdado da versão
 * anterior:
 * - 402 (plano sem acesso à IA): vira CTA de upgrade pro /planos.
 * - Qualquer outra falha (429, 502, rede): mensagem curta, chat continua usável.
 */

interface CompetencyScore {
  competency: string;
  score: number;
  maxScore: number;
  feedback: string;
}

interface ExamResultMessage {
  kind: "exam";
  id: string;
  title: string;
  multipleChoiceCount: number;
  essayCount: number;
}

interface LessonPlanBlock {
  durationMinutes: number;
  description: string;
}

interface LessonPlanResultMessage {
  kind: "lessonPlan";
  id: string;
  title: string;
  bnccCompetencies: string[];
  introduction: LessonPlanBlock;
  development: LessonPlanBlock;
  practicalActivity: LessonPlanBlock;
  assessment: LessonPlanBlock;
}

type FeedItem = ({ kind: "message" } & ChatMessageData) | ExamResultMessage | LessonPlanResultMessage;

type CommandKind = "gerar_prova" | "plano_aula";
const DONE_HOLD_MS = 450;
const CLIENT_TIMEOUT_MS = 55_000;
const TEXTAREA_MAX_HEIGHT_PX = 160;

/** Indicador de "digitando" — 3 bolinhas ciano, uma de cada vez, loop. */
function TypingDots() {
  return (
    <div
      className="flex items-center gap-1 rounded-2xl border px-3.5 py-2.5"
      style={{ backgroundColor: "#171b25", borderColor: "#232838" }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: "var(--color-one)" }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export function ChatCard() {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [input, setInput] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [status, setStatus] = useState<OneIconStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [planBlocked, setPlanBlocked] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [commandModal, setCommandModal] = useState<CommandKind | null>(null);
  const [commandText, setCommandText] = useState("");
  const [commandSubjectHint, setCommandSubjectHint] = useState("");
  const [commandError, setCommandError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const doneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  const refreshConversations = () => {
    fetch("/api/ai/chat/conversations")
      .then(async (res) => {
        const body = await res.json().catch(() => ({ success: false }));
        if (res.ok && body.success) setConversations(body.data);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshConversations();
  }, []);

  useEffect(() => {
    // Sugestões são efêmeras (só da resposta que acabou de chegar nesta
    // sessão) — trocar de conversa, ou recarregar uma já existente, nunca
    // deveria reexibir chips de uma troca anterior.
    setSuggestions([]);
    if (!activeConversationId) {
      setItems([]);
      return;
    }
    fetch(`/api/ai/chat?conversationId=${activeConversationId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({ success: false }));
        if (!res.ok || !body.success) return;
        setItems(body.data.map((m: { id: string; role: "user" | "assistant"; content: string }) => ({ kind: "message", ...m })));
      })
      .catch(() => {});
  }, [activeConversationId]);

  useEffect(() => {
    // `block: "nearest"` — sem isso, o scroll bubbleava pro ANCESTRAL mais
    // próximo que decidisse ser "melhor" pra centralizar o alvo, e com o
    // header agora `sticky` (redesign dark) isso virou a PÁGINA inteira
    // pulando pra cima a cada mensagem nova, não só o feed do chat rolando
    // internamente. `nearest` restringe ao contêiner de scroll mais
    // próximo (a própria `div.overflow-y-auto` do feed).
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [items]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
  }, [input]);

  async function handleSubmit(e: React.FormEvent | undefined, suggestionOverride?: string) {
    e?.preventDefault();
    // Clicar num chip de sugestão sempre manda mensagem NOVA, mesmo que o
    // professor estivesse editando outra — sai do modo edição em vez de
    // tentar aplicar a sugestão como correção da mensagem antiga.
    const isSuggestion = suggestionOverride !== undefined;
    const message = isSuggestion ? suggestionOverride.trim() : input.trim();
    if (!message || status === "thinking" || planBlocked) return;
    if (isSuggestion) setEditingMessageId(null);

    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }

    setError(null);
    setSuggestions([]);

    if (editingMessageId && !isSuggestion) {
      const id = editingMessageId;
      setEditingMessageId(null);
      setInput("");
      setStatus("thinking");
      // Remove tudo a partir da mensagem editada localmente (otimista) —
      // o backend faz o mesmo corte de verdade; se der erro, recarrega a
      // conversa do zero (fallback simples, ver catch abaixo).
      setItems((prev) => {
        const idx = prev.findIndex((it) => it.kind === "message" && it.id === id);
        return idx === -1 ? prev : prev.slice(0, idx);
      });
      setItems((prev) => [...prev, { kind: "message", id: `optimistic-${id}`, role: "user", content: message }]);

      try {
        const res = await fetch(`/api/ai/chat/messages/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
          signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
        });
        const body = await res.json();
        if (!res.ok || !body.success) {
          if (res.status === 402) {
            setPlanBlocked(true);
            setError(body.error ?? "Funcionalidade não disponível no plano atual.");
          } else {
            setError(body.error ?? "Não foi possível editar a mensagem.");
          }
          setStatus("idle");
          return;
        }
        setActiveConversationId(body.data.conversationId);
        await reloadActiveConversation(body.data.conversationId);
        setSuggestions(body.data.suggestions ?? []);
        refreshConversations();
        setStatus("done");
        doneTimeoutRef.current = setTimeout(() => {
          setStatus("idle");
          doneTimeoutRef.current = null;
        }, DONE_HOLD_MS);
      } catch (err) {
        setError(
          err instanceof Error && err.name === "TimeoutError"
            ? "A resposta demorou demais. Tente novamente."
            : "Falha de conexão. Tente novamente."
        );
        setStatus("idle");
      }
      return;
    }

    setItems((prev) => [...prev, { kind: "message", id: `optimistic-${Date.now()}`, role: "user", content: message }]);
    setInput("");
    setStatus("thinking");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId: activeConversationId ?? undefined }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const body = await res.json();

      if (!body.success) {
        if (res.status === 402) {
          setPlanBlocked(true);
          setError(body.error ?? "Funcionalidade não disponível no plano atual.");
        } else {
          setError(body.error ?? "Não foi possível obter uma resposta. Tente novamente.");
        }
        setStatus("idle");
        return;
      }

      setActiveConversationId(body.data.conversationId);
      setItems((prev) => [
        ...prev,
        { kind: "message", id: `new-${Date.now()}`, role: "assistant", content: body.data.reply, isNew: true },
      ]);
      setSuggestions(body.data.suggestions ?? []);
      refreshConversations();
      setStatus("done");
      doneTimeoutRef.current = setTimeout(() => {
        setStatus("idle");
        doneTimeoutRef.current = null;
      }, DONE_HOLD_MS);
    } catch (err) {
      setError(
        err instanceof Error && err.name === "TimeoutError"
          ? "A resposta demorou demais. Tente novamente."
          : "Falha de conexão. Tente novamente."
      );
      setStatus("idle");
    }
  }

  async function reloadActiveConversation(conversationId: string) {
    const res = await fetch(`/api/ai/chat?conversationId=${conversationId}`);
    const body = await res.json().catch(() => ({ success: false }));
    if (res.ok && body.success) {
      setItems(body.data.map((m: { id: string; role: "user" | "assistant"; content: string }) => ({ kind: "message", ...m })));
    }
  }

  const handleDeleteMessage = async (id: string) => {
    setItems((prev) => prev.filter((it) => !(it.kind === "message" && it.id === id)));
    try {
      await fetch(`/api/ai/chat/messages/${id}`, { method: "DELETE" });
    } catch {
      // Se falhar, a próxima troca de conversa/reload traz de volta —
      // não é crítico o bastante pra travar a tela com outro erro.
    }
  };

  const handleEditMessage = (id: string, content: string) => {
    setEditingMessageId(id);
    setInput(content);
    textareaRef.current?.focus();
  };

  const handleRegenerate = async (assistantMessageId: string) => {
    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }
    setError(null);
    setSuggestions([]);
    setStatus("thinking");
    setItems((prev) => prev.filter((it) => !(it.kind === "message" && it.id === assistantMessageId)));
    try {
      const res = await fetch(`/api/ai/chat/messages/${assistantMessageId}/regenerate`, {
        method: "POST",
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body.error ?? "Não foi possível regenerar a resposta.");
        setStatus("idle");
        if (activeConversationId) await reloadActiveConversation(activeConversationId);
        return;
      }
      setItems((prev) => [
        ...prev,
        { kind: "message", id: `new-${Date.now()}`, role: "assistant", content: body.data.reply, isNew: true },
      ]);
      setSuggestions(body.data.suggestions ?? []);
      setStatus("done");
      doneTimeoutRef.current = setTimeout(() => {
        setStatus("idle");
        doneTimeoutRef.current = null;
      }, DONE_HOLD_MS);
    } catch {
      setError("Falha de conexão. Tente novamente.");
      setStatus("idle");
    }
  };

  const handleNewConversation = () => {
    setActiveConversationId(null);
    setItems([]);
    setEditingMessageId(null);
    setInput("");
    setError(null);
    setMobileSidebarOpen(false);
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setEditingMessageId(null);
    setInput("");
    setError(null);
    setMobileSidebarOpen(false);
  };

  const handleDeleteConversation = async (id: string) => {
    setConversations((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    if (id === activeConversationId) handleNewConversation();
    try {
      await fetch(`/api/ai/chat/conversations/${id}`, { method: "DELETE" });
    } catch {
      refreshConversations();
    }
  };

  async function handleCommandSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!commandModal || commandText.trim().length < 50) return;

    if (doneTimeoutRef.current) {
      clearTimeout(doneTimeoutRef.current);
      doneTimeoutRef.current = null;
    }
    setCommandError(null);
    setStatus("thinking");
    const command = commandModal;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command,
          context: { text: commandText.trim(), subjectHint: commandSubjectHint.trim() || undefined },
        }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "Não foi possível gerar o conteúdo agora.");
      }

      if (command === "gerar_prova") {
        setItems((prev) => [
          ...prev,
          {
            kind: "exam",
            id: body.data.id,
            title: body.data.title,
            multipleChoiceCount: body.data.multipleChoice.length,
            essayCount: body.data.essay.length,
          },
        ]);
      } else {
        setItems((prev) => [
          ...prev,
          {
            kind: "lessonPlan",
            id: body.data.id,
            title: body.data.title,
            bnccCompetencies: body.data.bnccCompetencies,
            introduction: body.data.introduction,
            development: body.data.development,
            practicalActivity: body.data.practicalActivity,
            assessment: body.data.assessment,
          },
        ]);
      }

      setCommandModal(null);
      setCommandText("");
      setCommandSubjectHint("");
      setStatus("done");
      doneTimeoutRef.current = setTimeout(() => {
        setStatus("idle");
        doneTimeoutRef.current = null;
      }, DONE_HOLD_MS);
    } catch (err) {
      setCommandError(err instanceof Error ? err.message : "Erro ao gerar conteúdo.");
      setStatus("idle");
    }
  }

  const inputDisabled = status === "thinking" || planBlocked;
  const commandModalTitle = commandModal === "gerar_prova" ? "Gerar prova" : "Plano de aula (BNCC)";

  const sidebarProps = {
    conversations,
    activeConversationId,
    onSelect: handleSelectConversation,
    onNew: handleNewConversation,
    onDelete: handleDeleteConversation,
    loading: conversations === null,
  };

  return (
    <div
      data-theme-surface
      className="grid h-full w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm md:grid-cols-[240px_1fr]"
    >
      {/* Sidebar — só desktop; em mobile vira drawer (mesmo padrão de MobileNav) */}
      <div className="hidden md:block">
        <ChatSidebar {...sidebarProps} />
      </div>
      <Modal open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} title="Conversas" variant="drawer">
        <ChatSidebar {...sidebarProps} />
      </Modal>

      <div className="flex min-w-0 flex-col">
        <div data-theme-surface className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <Button variant="ghost" onClick={() => setMobileSidebarOpen(true)} className="px-2 md:hidden" aria-label="Ver conversas">
            <PanelLeft size={18} />
          </Button>
          <OneAvatar size={32} glow={status === "thinking"} />
          <div>
            <p className="font-heading text-sm font-semibold text-[var(--color-foreground-strong)]">Assistente One</p>
            <p className="flex items-center gap-1.5 text-xs text-[var(--color-foreground-muted)]">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: status === "thinking" ? "var(--color-one)" : "var(--color-data-positive)" }}
              />
              {status === "thinking" ? "Pensando…" : "Pergunte sobre turmas, notas ou frequência"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-b border-[var(--color-border)] px-4 py-2">
          <Button variant="ghost" onClick={() => setCommandModal("gerar_prova")} disabled={inputDisabled}>
            <FileQuestion size={15} className="mr-1.5 inline-block align-[-3px]" />
            Gerar prova
          </Button>
          <Button variant="ghost" onClick={() => setCommandModal("plano_aula")} disabled={inputDisabled}>
            <GraduationCap size={15} className="mr-1.5 inline-block align-[-3px]" />
            Plano de aula
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {items.length === 0 && !planBlocked && (
            <p className="text-sm text-[var(--color-foreground-muted)]">Nenhuma mensagem ainda.</p>
          )}

          <AnimatePresence initial={false}>
            {items.map((item, i) => {
              if (item.kind === "message") {
                return (
                  <ChatMessage
                    key={item.id}
                    message={item}
                    onDelete={handleDeleteMessage}
                    onEdit={handleEditMessage}
                    onRegenerate={handleRegenerate}
                  />
                );
              }

              if (item.kind === "exam") {
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial="hidden"
                    animate="visible"
                    variants={fadeSlideUpItem}
                    data-theme-surface
                    className="max-w-[90%] self-start space-y-2 rounded-lg border p-3 text-sm"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-muted)" }}
                  >
                    <p className="font-medium text-[var(--color-foreground)]">{item.title}</p>
                    <p className="text-xs text-[var(--color-foreground-muted)]">
                      {item.multipleChoiceCount} questões de múltipla escolha + {item.essayCount} discursivas
                    </p>
                    <a
                      href={`/api/ai/exam-generator/${item.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      Baixar PDF
                    </a>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial="hidden"
                  animate="visible"
                  variants={fadeSlideUpItem}
                  data-theme-surface
                  className="max-w-[90%] self-start space-y-2 rounded-lg border p-3 text-sm"
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-muted)" }}
                >
                  <p className="font-medium text-[var(--color-foreground)]">{item.title}</p>
                  <ul className="list-inside list-disc text-xs text-[var(--color-foreground-muted)]">
                    {item.bnccCompetencies.map((c, ci) => (
                      <li key={ci}>{c}</li>
                    ))}
                  </ul>
                  {(
                    [
                      ["Introdução", item.introduction],
                      ["Desenvolvimento", item.development],
                      ["Atividade prática", item.practicalActivity],
                      ["Avaliação", item.assessment],
                    ] as const
                  ).map(([label, block]) => (
                    <div key={label}>
                      <p className="text-xs font-semibold text-[var(--color-foreground)]">
                        {label} ({block.durationMinutes} min)
                      </p>
                      <p className="text-xs text-[var(--color-foreground-muted)]">{block.description}</p>
                    </div>
                  ))}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {status === "thinking" && (
            <div className="flex items-center gap-2">
              <OneAvatar size={24} />
              <TypingDots />
            </div>
          )}

          {planBlocked ? (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeSlideUpItem}
              data-theme-surface
              className="rounded-lg border p-3 text-center"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-muted)" }}
            >
              <p className="mb-2 text-xs text-[var(--color-foreground)]">{error}</p>
              <LinkButton href="/planos" variant="primary">
                Ver planos
              </LinkButton>
            </motion.div>
          ) : (
            error && <p className="text-xs text-rose-500">{error}</p>
          )}
          <div ref={feedEndRef} />
        </div>

        {suggestions.length > 0 && status !== "thinking" && !planBlocked && (
          <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-[var(--color-border)] px-4 py-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSubmit(undefined, s)}
                className="rounded-full border px-2.5 py-1 text-xs font-medium text-[var(--color-foreground-muted)] hover:border-brand hover:text-brand"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {editingMessageId && (
          <div
            data-theme-surface
            className="flex shrink-0 items-center justify-between border-t px-4 py-1.5 text-xs text-[var(--color-foreground-muted)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            Editando mensagem…
            <button
              type="button"
              onClick={() => {
                setEditingMessageId(null);
                setInput("");
              }}
              className="font-medium text-brand hover:underline"
            >
              Cancelar
            </button>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          data-theme-surface
          className="flex shrink-0 items-end gap-2 border-t border-[var(--color-border)] px-3 py-2"
        >
          <button
            type="button"
            disabled
            title="Anexar documento/imagem — em breve"
            aria-label="Anexar documento/imagem (em breve)"
            className="mb-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-foreground-muted)] opacity-40"
          >
            <Paperclip size={16} />
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={planBlocked ? "Faça upgrade para continuar…" : "Pergunte algo à One…"}
            maxLength={500}
            disabled={inputDisabled}
            className="input-field flex-1 resize-none rounded-md px-3 py-2 text-sm leading-normal disabled:opacity-60"
            style={{ maxHeight: TEXTAREA_MAX_HEIGHT_PX }}
          />
          <Button
            type="submit"
            disabled={inputDisabled || !input.trim()}
            variant="secondary"
            className="mb-0.5 px-2.5"
            style={input.trim() ? { background: "var(--gradient-one)", color: "#0a0d1a", borderColor: "transparent" } : undefined}
          >
            <Send size={16} />
          </Button>
        </form>
        <p className="shrink-0 px-4 pb-2 text-center text-[10px] text-[var(--color-foreground-faint)]">
          A One anonimiza nomes de alunos antes de qualquer análise externa de IA.
        </p>
      </div>

      <Modal open={commandModal !== null} onClose={() => setCommandModal(null)} title={commandModalTitle} variant="center">
        <form onSubmit={handleCommandSubmit} className="space-y-3">
          <textarea
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            placeholder="Cole o conteúdo/texto-base (mínimo 50 caracteres)…"
            rows={6}
            className="input-field w-full rounded-md px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={commandSubjectHint}
            onChange={(e) => setCommandSubjectHint(e.target.value)}
            placeholder="Disciplina/série (opcional)"
            className="input-field h-10 w-full rounded-md px-3 text-sm"
          />
          {commandError && <p className="text-xs text-rose-500">{commandError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCommandModal(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={status === "thinking" || commandText.trim().length < 50}>
              {status === "thinking" ? "Gerando…" : "Gerar"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
