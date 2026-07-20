"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedCard, AnimatedList, AnimatedListItem } from "@/components/motion/AnimatedCard";

interface TenantRef {
  id: string;
  name: string;
}

interface OrganizationData {
  id: string;
  name: string;
  tenants: TenantRef[];
}

export default function OrganizationManager({
  organizations,
  candidateTenants,
}: {
  organizations: OrganizationData[];
  candidateTenants: TenantRef[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error ?? "Não foi possível criar a Organization.");
      }
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar Organization.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <AnimatedList className="space-y-4" staggerChildren={0.06}>
        {organizations.map((org) => (
          <AnimatedListItem key={org.id}>
            <OrganizationCard org={org} candidateTenants={candidateTenants} />
          </AnimatedListItem>
        ))}
      </AnimatedList>

      <AnimatedCard
        className="space-y-3 rounded-lg border p-4"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <form onSubmit={handleCreate} className="space-y-3">
          <p className="text-sm font-medium text-[var(--color-foreground)]">Criar nova Organization</p>
          <input
            type="text"
            placeholder="Nome da rede (ex: Colégio Alpha — Unidades)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            className="input-field h-10 w-full rounded-md px-3 text-sm"
          />
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Criando…" : "Criar Organization"}
          </Button>
        </form>
      </AnimatedCard>
    </div>
  );
}

function OrganizationCard({ org, candidateTenants }: { org: OrganizationData; candidateTenants: TenantRef[] }) {
  const router = useRouter();
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const filteredTenants = org.tenants.filter((t) => t.name.toLowerCase().includes(filter.trim().toLowerCase()));

  const handleLink = async () => {
    if (!selectedTenantId) return;
    setBusyTenantId(selectedTenantId);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${org.id}/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedTenantId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error ?? "Não foi possível vincular.");
      }
      setSelectedTenantId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao vincular.");
    } finally {
      setBusyTenantId(null);
    }
  };

  const handleUnlink = async (tenantId: string) => {
    setBusyTenantId(tenantId);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${org.id}/tenants/${tenantId}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.error ?? "Não foi possível desvincular.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desvincular.");
    } finally {
      setBusyTenantId(null);
    }
  };

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--color-foreground)]">{org.name}</p>
        {org.tenants.length > 0 && (
          <Link
            href={`/organizacoes/${org.id}/dashboard`}
            className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            <LayoutDashboard size={12} />
            Dashboard consolidado
          </Link>
        )}
      </div>

      {org.tenants.length === 0 ? (
        <p className="mb-3 text-xs text-[var(--color-foreground-muted)]">Nenhuma escola vinculada ainda.</p>
      ) : (
        <>
          {org.tenants.length > 4 && (
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar escolas vinculadas…"
              className="input-field mb-2 h-8 w-full rounded-md px-2 text-xs"
            />
          )}
          {filteredTenants.length === 0 ? (
            <p className="mb-3 text-xs text-[var(--color-foreground-muted)]">Nenhuma escola corresponde ao filtro.</p>
          ) : (
            <ul className="mb-3 space-y-1.5">
              {filteredTenants.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--color-foreground)]">{t.name}</span>
                  <Button
                    variant="ghost"
                    onClick={() => handleUnlink(t.id)}
                    disabled={busyTenantId !== null}
                    className="h-7 px-2 text-xs text-rose-500"
                  >
                    {busyTenantId === t.id ? "Desvinculando…" : "Desvincular"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {candidateTenants.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="input-field h-9 flex-1 rounded-md px-2 text-xs"
          >
            <option value="">Vincular escola existente…</option>
            {candidateTenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button
            onClick={handleLink}
            disabled={!selectedTenantId || busyTenantId !== null}
            className="h-9 px-3 text-xs"
          >
            {busyTenantId === selectedTenantId ? "Vinculando…" : "Vincular"}
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
    </div>
  );
}
