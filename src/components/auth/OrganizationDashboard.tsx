"use client";

import { useEffect, useState } from "react";
import { AnimatedCard } from "@/components/motion/AnimatedCard";

interface SchoolSummary {
  tenantId: string;
  tenantName: string;
  classCount: number;
  studentCount: number;
  overallAverage: number | null;
  averageAttendancePct: number | null;
  classesBelowAverage: number;
  studentsLowAttendance: number;
}

interface DashboardData {
  organizationName: string;
  schools: SchoolSummary[];
  excludedSchoolNames: string[];
}

function TotalCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3 text-center" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}>
      <p className="font-heading text-lg font-bold text-[var(--color-foreground)]">{value}</p>
      <p className="text-[11px] text-[var(--color-foreground-muted)]">{label}</p>
    </div>
  );
}

export function OrganizationDashboard({ organizationId }: { organizationId: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/organizations/${organizationId}/dashboard`)
      .then((res) => res.json())
      .then((body) => {
        if (!body.success) throw new Error(body.error ?? "Falha ao carregar o consolidado.");
        setData(body.data);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar o consolidado."));
  }, [organizationId]);

  if (error) return <p className="text-sm text-rose-500">{error}</p>;
  if (!data) return <p className="text-sm text-[var(--color-foreground-muted)]">Carregando…</p>;

  const totals = data.schools.reduce(
    (acc, s) => ({
      classCount: acc.classCount + s.classCount,
      studentCount: acc.studentCount + s.studentCount,
      classesBelowAverage: acc.classesBelowAverage + s.classesBelowAverage,
      studentsLowAttendance: acc.studentsLowAttendance + s.studentsLowAttendance,
    }),
    { classCount: 0, studentCount: 0, classesBelowAverage: 0, studentsLowAttendance: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TotalCard label="Escolas" value={String(data.schools.length)} />
        <TotalCard label="Turmas" value={String(totals.classCount)} />
        <TotalCard label="Alunos" value={String(totals.studentCount)} />
        <TotalCard label="Turmas abaixo da média" value={String(totals.classesBelowAverage)} />
      </div>

      {data.schools.length === 0 ? (
        <p className="text-sm text-[var(--color-foreground-muted)]">
          Nenhuma escola desta rede está disponível pro consolidado — você precisa ser administrador ativo em
          pelo menos uma escola vinculada.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--color-foreground-muted)]" style={{ borderColor: "var(--color-border)" }}>
                <th className="px-3 py-2">Escola</th>
                <th className="px-3 py-2">Turmas</th>
                <th className="px-3 py-2">Alunos</th>
                <th className="px-3 py-2">Média geral</th>
                <th className="px-3 py-2">Frequência</th>
                <th className="px-3 py-2">Turmas abaixo da média</th>
                <th className="px-3 py-2">Evasão por frequência</th>
              </tr>
            </thead>
            <tbody>
              {data.schools.map((s) => (
                <tr key={s.tenantId} className="border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
                  <td className="px-3 py-2 font-medium text-[var(--color-foreground)]">{s.tenantName}</td>
                  <td className="px-3 py-2">{s.classCount}</td>
                  <td className="px-3 py-2">{s.studentCount}</td>
                  <td className="px-3 py-2">{s.overallAverage !== null ? s.overallAverage.toFixed(1) : "—"}</td>
                  <td className="px-3 py-2">{s.averageAttendancePct !== null ? `${Math.round(s.averageAttendancePct)}%` : "—"}</td>
                  <td className="px-3 py-2">
                    {s.classesBelowAverage > 0 ? (
                      <span className="text-rose-500">{s.classesBelowAverage}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {s.studentsLowAttendance > 0 ? (
                      <span className="text-rose-500">{s.studentsLowAttendance}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.excludedSchoolNames.length > 0 && (
        <AnimatedCard className="rounded-lg border p-3 text-xs text-[var(--color-foreground-muted)]" style={{ borderColor: "var(--color-border)" }}>
          Fora do consolidado (sem administração ativa sua): {data.excludedSchoolNames.join(", ")}.
        </AnimatedCard>
      )}
    </div>
  );
}
