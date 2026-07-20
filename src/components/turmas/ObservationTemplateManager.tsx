"use client";

import { useState, type FormEvent } from "react";
import { Trash2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";

interface TemplateItem {
  id: string;
  text: string;
  createdAt: string;
}

export function ObservationTemplateManager({ initialTemplates }: { initialTemplates: TemplateItem[] }) {
  const [templates, setTemplates] = useState<TemplateItem[]>(initialTemplates);
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/observation-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível salvar.");
      setTemplates((prev) => [body.data, ...prev]);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/observation-templates/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error ?? "Não foi possível excluir.");
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopy(template: TemplateItem) {
    await navigator.clipboard.writeText(template.text).catch(() => {});
    setCopiedId(template.id);
    setTimeout(() => setCopiedId((prev) => (prev === template.id ? null : prev)), 1500);
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="space-y-2 rounded-lg border p-4"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva uma observação reutilizável (ex: elogio recorrente, alerta de comportamento...)"
          required
          minLength={1}
          maxLength={1000}
          rows={3}
          className="input-field w-full rounded-md px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={creating}>
          {creating ? "Salvando…" : "Salvar observação"}
        </Button>
        {error && <p className="text-xs text-rose-500">{error}</p>}
      </form>

      {templates.length === 0 ? (
        <p className="text-sm text-[var(--color-foreground-muted)]">
          Nenhuma observação salva ainda. Você também pode salvar direto de uma sugestão de IA, na tela de notas.
        </p>
      ) : (
        <AnimatedList className="space-y-2" staggerChildren={0.04}>
          {templates.map((template) => (
            <AnimatedListItem key={template.id}>
              <div
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
              >
                <p className="flex-1 text-sm text-[var(--color-foreground)]">{template.text}</p>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" onClick={() => handleCopy(template)} className="h-7 px-2" aria-label="Copiar">
                    {copiedId === template.id ? <Check size={14} /> : <Copy size={14} />}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleDelete(template.id)}
                    disabled={busyId === template.id}
                    className="h-7 px-2 text-rose-500"
                    aria-label="Excluir"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </AnimatedListItem>
          ))}
        </AnimatedList>
      )}
    </div>
  );
}
