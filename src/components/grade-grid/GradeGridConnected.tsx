"use client";

/**
 * Wrapper fino sobre a <GradeGrid /> pura (entregue na etapa anterior).
 * Único trabalho: fornecer o `onSaveGrade` real, apontando pro endpoint
 * /api/grades. Mantém a GradeGrid em si livre de qualquer detalhe de
 * transporte (fetch, headers, etc.) — ela só sabe chamar uma função.
 */

import GradeGrid, { type GradeGridProps } from "./GradeGrid";

type GradeGridConnectedProps = Omit<GradeGridProps, "onSaveGrade">;

export default function GradeGridConnected(props: GradeGridConnectedProps) {
  const onSaveGrade: NonNullable<GradeGridProps["onSaveGrade"]> = async ({
    enrollmentId,
    gradeConfigId,
    value,
  }) => {
    const response = await fetch("/api/grades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentId, gradeConfigId, value }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      // Lançar aqui é o que faz o GradeStore marcar a célula como "error"
      // (ponto vermelho) — ver GradeGrid.tsx > persist().
      throw new Error(body.error ?? `Falha ao salvar nota (HTTP ${response.status}).`);
    }
  };

  return <GradeGrid {...props} onSaveGrade={onSaveGrade} />;
}
