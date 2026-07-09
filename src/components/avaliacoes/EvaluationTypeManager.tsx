"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard, AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";

interface EvaluationTypeItem {
  id: string;
  name: string;
  active: boolean;
}

export function EvaluationTypeManager({ initialTypes }: { initialTypes: EvaluationTypeItem[] }) {
  const [types, setTypes] = useState<EvaluationTypeItem[]>(initialTypes);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/evaluation-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível criar o tipo.");
      setTypes((prev) => [...prev, { id: body.data.id, name: body.data.name, active: true }]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar tipo.");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (type: EvaluationTypeItem) => {
    setBusyId(type.id);
    setError(null);
    try {
      const res = await fetch(`/api/evaluation-types/${type.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !type.active }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível atualizar.");
      setTypes((prev) => prev.map((t) => (t.id === type.id ? { ...t, active: !t.active } : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar.");
    } finally {
      setBusyId(null);
    }
  };

  const startRename = (type: EvaluationTypeItem) => {
    setRenamingId(type.id);
    setRenameDraft(type.name);
  };

  const submitRename = async (typeId: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) return;
    setBusyId(typeId);
    setError(null);
    try {
      const res = await fetch(`/api/evaluation-types/${typeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível renomear.");
      setTypes((prev) => prev.map((t) => (t.id === typeId ? { ...t, name: trimmed } : t)));
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao renomear.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (typeId: string) => {
    setBusyId(typeId);
    setError(null);
    try {
      const res = await fetch(`/api/evaluation-types/${typeId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível excluir.");
      setTypes((prev) => prev.filter((t) => t.id !== typeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AnimatedCard
        className="space-y-3 rounded-lg border p-4"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Novo tipo (ex: Seminário, Estudo dirigido...)"
            required
            minLength={1}
            maxLength={60}
            className="input-field h-9 flex-1 rounded-md px-3 text-sm"
          />
          <Button type="submit" disabled={creating}>
            {creating ? "Criando…" : "Adicionar"}
          </Button>
        </form>
        {error && <p className="text-xs text-rose-500">{error}</p>}
      </AnimatedCard>

      <AnimatedList className="space-y-2" staggerChildren={0.04}>
        {types.map((type) => (
          <AnimatedListItem key={type.id}>
            <div
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
            >
              {renamingId === type.id ? (
                <input
                  type="text"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => submitRename(type.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitRename(type.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  autoFocus
                  className="input-field h-8 flex-1 rounded-md px-2 text-sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startRename(type)}
                  className="flex-1 text-left text-sm font-medium text-[var(--color-foreground)] hover:underline"
                  style={{ opacity: type.active ? 1 : 0.5 }}
                >
                  {type.name}
                  {!type.active && <span className="ml-2 text-xs text-[var(--color-foreground-muted)]">(inativo)</span>}
                </button>
              )}

              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  onClick={() => handleToggleActive(type)}
                  disabled={busyId === type.id}
                  className="h-7 px-2 text-xs"
                >
                  {type.active ? "Desativar" : "Ativar"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleDelete(type.id)}
                  disabled={busyId === type.id}
                  className="h-7 px-2 text-rose-500"
                  aria-label="Excluir tipo"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          </AnimatedListItem>
        ))}
      </AnimatedList>
    </div>
  );
}
