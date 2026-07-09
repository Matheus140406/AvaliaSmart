"use client";

/**
 * GradeGrid — Componente principal de lançamento de notas (experiência "Excel").
 *
 * - Navegação por teclado (Tab / Shift+Tab / Enter / Setas) entre células, sem reload.
 * - Auto-save com debounce de 500ms por célula, com indicador de status individual.
 * - Cálculo em tempo real de Média Ponderada (por pesos de GradeConfig) e classificação
 *   Aprovado / Recuperação / Reprovado / Pendente, com cor dinâmica por célula e por linha.
 * - Reatividade por célula via um pequeno "external store" (useSyncExternalStore), para
 *   que digitar em uma célula não force o re-render da tabela inteira — mantendo a
 *   performance necessária mesmo com centenas de alunos x avaliações.
 *
 * Uso típico:
 *   <GradeGrid
 *     students={students}
 *     gradeConfigs={gradeConfigs}
 *     initialGrades={initialGrades}
 *     onSaveGrade={({ enrollmentId, gradeConfigId, value }) =>
 *       fetch("/api/grades", { method: "POST", body: JSON.stringify({ enrollmentId, gradeConfigId, value }) })
 *     }
 *   />
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  GradeConfigDTO,
  GradeCellValue,
  StudentRow,
  SaveStatus,
} from "@/types/grade-grid";
import { cellKeyToString } from "@/types/grade-grid";
import {
  classifyAverage,
  classifySingleValue,
  computeWeightedAverage,
  type GradeStatus,
} from "@/lib/grades/calculations";

// ---------------------------------------------------------------------------------------
// Estilos visuais por classificação (a lógica de cálculo em si mora em lib/grades/calculations.ts)
// ---------------------------------------------------------------------------------------

const STATUS_STYLES: Record<GradeStatus, { cell: string; badge: string; label: string }> = {
  aprovado: {
    cell: "bg-emerald-50 focus-within:bg-emerald-100 text-emerald-900",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    label: "Aprovado",
  },
  recuperacao: {
    cell: "bg-amber-50 focus-within:bg-amber-100 text-amber-900",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    label: "Recuperação",
  },
  reprovado: {
    cell: "bg-rose-50 focus-within:bg-rose-100 text-rose-900",
    badge: "bg-rose-100 text-rose-700 border-rose-200",
    label: "Reprovado",
  },
  pendente: {
    cell: "bg-neutral-50 focus-within:bg-neutral-100 text-neutral-400",
    badge: "bg-neutral-100 text-neutral-500 border-neutral-200",
    label: "Pendente",
  },
};

// ---------------------------------------------------------------------------------------
// Store por célula (evita re-render da tabela inteira a cada tecla digitada)
// ---------------------------------------------------------------------------------------

interface CellState {
  value: number | null;
  status: SaveStatus;
}

type SaveFn = (params: {
  enrollmentId: string;
  gradeConfigId: string;
  value: number | null;
}) => Promise<void>;

class GradeStore {
  private cells: Map<string, CellState>;
  private cellListeners = new Map<string, Set<() => void>>();
  private rowListeners = new Map<string, Set<() => void>>();
  private rowVersions = new Map<string, number>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private onSave: SaveFn;

  constructor(initial: Map<string, CellState>, onSave: SaveFn) {
    this.cells = initial;
    this.onSave = onSave;
  }

  private keyOf(enrollmentId: string, gradeConfigId: string) {
    return cellKeyToString({ enrollmentId, gradeConfigId });
  }

  getSnapshot = (key: string): CellState => {
    return this.cells.get(key) ?? { value: null, status: "idle" };
  };

  getRowVersion = (enrollmentId: string): number => {
    return this.rowVersions.get(enrollmentId) ?? 0;
  };

  subscribeCell = (key: string, cb: () => void) => {
    if (!this.cellListeners.has(key)) this.cellListeners.set(key, new Set());
    this.cellListeners.get(key)!.add(cb);
    return () => this.cellListeners.get(key)?.delete(cb);
  };

  subscribeRow = (enrollmentId: string, cb: () => void) => {
    if (!this.rowListeners.has(enrollmentId)) this.rowListeners.set(enrollmentId, new Set());
    this.rowListeners.get(enrollmentId)!.add(cb);
    return () => this.rowListeners.get(enrollmentId)?.delete(cb);
  };

  private notifyCell(key: string) {
    this.cellListeners.get(key)?.forEach((cb) => cb());
  }

  private notifyRow(enrollmentId: string) {
    this.rowVersions.set(enrollmentId, this.getRowVersion(enrollmentId) + 1);
    this.rowListeners.get(enrollmentId)?.forEach((cb) => cb());
  }

  /** Edição do usuário: atualiza valor, marca "pending" e (re)agenda o auto-save. */
  setValue = (enrollmentId: string, gradeConfigId: string, value: number | null) => {
    const key = this.keyOf(enrollmentId, gradeConfigId);
    this.cells.set(key, { value, status: "pending" });
    this.notifyCell(key);
    this.notifyRow(enrollmentId);

    const existingTimer = this.timers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => this.persist(enrollmentId, gradeConfigId), 500);
    this.timers.set(key, timer);
  };

  private setStatus(key: string, status: SaveStatus) {
    const prev = this.getSnapshot(key);
    this.cells.set(key, { ...prev, status });
    this.notifyCell(key);
  }

  private async persist(enrollmentId: string, gradeConfigId: string) {
    const key = this.keyOf(enrollmentId, gradeConfigId);
    const { value } = this.getSnapshot(key);
    this.setStatus(key, "saving");
    try {
      await this.onSave({ enrollmentId, gradeConfigId, value });
      this.setStatus(key, "saved");
      setTimeout(() => this.setStatus(key, "idle"), 1500);
    } catch {
      this.setStatus(key, "error");
    }
  }
}

const GradeStoreContext = createContext<GradeStore | null>(null);

function useGradeStore(): GradeStore {
  const store = useContext(GradeStoreContext);
  if (!store) throw new Error("GradeGrid: store de notas não encontrado no contexto.");
  return store;
}

/**
 * Auto-save simulado (mock). Em produção, substitua via a prop `onSaveGrade`
 * por uma chamada real (ex.: `PATCH /api/grades`).
 * Mantém uma pequena taxa de falha aleatória apenas para exercitar o estado de erro.
 */
async function mockSaveGrade(params: {
  enrollmentId: string;
  gradeConfigId: string;
  value: number | null;
}): Promise<void> {
  const latency = 300 + Math.random() * 400;
  await new Promise((resolve) => setTimeout(resolve, latency));
  if (Math.random() < 0.05) {
    throw new Error("Falha simulada ao salvar nota.");
  }
  // eslint-disable-next-line no-console
  console.debug("[GradeGrid] nota salva (mock):", params);
}

// ---------------------------------------------------------------------------------------
// Navegação por teclado
// ---------------------------------------------------------------------------------------

function useGridNavigation(rowCount: number, colCount: number) {
  const refs = useRef<(HTMLInputElement | null)[][]>([]);

  const registerRef = useCallback(
    (rowIndex: number, colIndex: number, el: HTMLInputElement | null) => {
      if (!refs.current[rowIndex]) refs.current[rowIndex] = [];
      refs.current[rowIndex][colIndex] = el;
    },
    []
  );

  const focusCell = useCallback(
    (row: number, col: number) => {
      const r = Math.max(0, Math.min(rowCount - 1, row));
      const c = Math.max(0, Math.min(colCount - 1, col));
      const el = refs.current[r]?.[c];
      el?.focus();
      el?.select();
    },
    [rowCount, colCount]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          focusCell(row, col + 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          focusCell(row, col - 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          focusCell(row - 1, col);
          break;
        case "ArrowDown":
        case "Enter":
          e.preventDefault();
          focusCell(row + 1, col);
          break;
        case "Tab": {
          e.preventDefault();
          let nextRow = row;
          let nextCol = col + (e.shiftKey ? -1 : 1);
          if (nextCol >= colCount) {
            nextCol = 0;
            nextRow += 1;
          } else if (nextCol < 0) {
            nextCol = colCount - 1;
            nextRow -= 1;
          }
          focusCell(nextRow, nextCol);
          break;
        }
        default:
          break;
      }
    },
    [focusCell, colCount]
  );

  return { registerRef, handleKeyDown };
}

// ---------------------------------------------------------------------------------------
// Subcomponentes de célula
// ---------------------------------------------------------------------------------------

function SaveStatusDot({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;
  const styles: Record<Exclude<SaveStatus, "idle">, string> = {
    pending: "bg-[var(--color-foreground-muted)]",
    saving: "bg-brand animate-pulse",
    saved: "bg-emerald-500",
    error: "bg-rose-500",
  };
  return (
    <span
      className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${styles[status]}`}
      aria-hidden="true"
    />
  );
}

interface GradeInputCellProps {
  enrollmentId: string;
  gradeConfig: GradeConfigDTO;
  rowIndex: number;
  colIndex: number;
  registerRef: (row: number, col: number, el: HTMLInputElement | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>, row: number, col: number) => void;
}

function GradeInputCell({
  enrollmentId,
  gradeConfig,
  rowIndex,
  colIndex,
  registerRef,
  onKeyDown,
}: GradeInputCellProps) {
  const store = useGradeStore();
  const key = cellKeyToString({ enrollmentId, gradeConfigId: gradeConfig.id });

  const state = useSyncExternalStore(
    (cb) => store.subscribeCell(key, cb),
    () => store.getSnapshot(key),
    () => store.getSnapshot(key)
  );

  const status = classifySingleValue(state.value, gradeConfig.maxScore);
  const styles = STATUS_STYLES[status];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(",", ".");
    if (raw === "") {
      store.setValue(enrollmentId, gradeConfig.id, null);
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(0, Math.min(gradeConfig.maxScore, parsed));
    store.setValue(enrollmentId, gradeConfig.id, clamped);
  };

  return (
    <div className={`relative ${styles.cell} transition-colors duration-150`}>
      <input
        ref={(el) => registerRef(rowIndex, colIndex, el)}
        type="text"
        inputMode="decimal"
        value={state.value ?? ""}
        onChange={handleChange}
        onKeyDown={(e) => onKeyDown(e, rowIndex, colIndex)}
        placeholder="—"
        aria-label={`${gradeConfig.name}, nota máxima ${gradeConfig.maxScore}`}
        className="w-full h-9 bg-transparent px-2 text-sm text-center outline-none
                   focus:ring-2 focus:ring-inset focus:ring-brand tabular-nums"
      />
      <SaveStatusDot status={state.status} />
    </div>
  );
}

function AverageCell({
  enrollmentId,
  gradeConfigs,
}: {
  enrollmentId: string;
  gradeConfigs: GradeConfigDTO[];
}) {
  const store = useGradeStore();

  useSyncExternalStore(
    (cb) => store.subscribeRow(enrollmentId, cb),
    () => store.getRowVersion(enrollmentId),
    () => store.getRowVersion(enrollmentId)
  );

  const { average, filled, total } = computeWeightedAverage(gradeConfigs, (gradeConfigId) => {
    const key = cellKeyToString({ enrollmentId, gradeConfigId });
    return store.getSnapshot(key).value;
  });

  const status = classifyAverage(average, filled);
  const styles = STATUS_STYLES[status];

  return (
    <div className={`flex items-center justify-center gap-2 h-9 px-2 ${styles.cell}`}>
      <span className="text-sm font-semibold tabular-nums">
        {average !== null ? average.toFixed(1) : "—"}
      </span>
      <span
        className={`hidden sm:inline-flex text-[10px] px-1.5 py-0.5 rounded-full border ${styles.badge}`}
      >
        {styles.label}
      </span>
      <span className="text-[10px] text-[var(--color-foreground-muted)] tabular-nums">
        {filled}/{total}
      </span>
    </div>
  );
}

function AttendanceCell({ pct }: { pct: number }) {
  const color =
    pct >= 90 ? "text-emerald-600" : pct >= 75 ? "text-amber-600" : "text-rose-600";
  return (
    <div className="flex items-center justify-center h-9 px-2">
      <span className={`text-sm font-medium tabular-nums ${color}`}>{pct.toFixed(0)}%</span>
    </div>
  );
}

function StudentCell({ student }: { student: StudentRow }) {
  return (
    <div className="flex items-center gap-2 h-9 px-3 min-w-[200px]">
      <div className="h-6 w-6 shrink-0 rounded-full bg-[var(--color-surface-muted)] overflow-hidden">
        {student.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={student.photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[10px] font-medium text-[var(--color-foreground-muted)]">
            {student.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{student.name}</p>
        {student.registrationCode && (
          <p className="text-[11px] text-[var(--color-foreground-muted)] truncate">{student.registrationCode}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------------------

export interface GradeGridProps {
  students: StudentRow[];
  gradeConfigs: GradeConfigDTO[];
  initialGrades: GradeCellValue[];
  onSaveGrade?: SaveFn;
  className?: string;
}

export default function GradeGrid({
  students,
  gradeConfigs,
  initialGrades,
  onSaveGrade,
  className = "",
}: GradeGridProps) {
  const sortedConfigs = useMemo(
    () => [...gradeConfigs].sort((a, b) => a.order - b.order),
    [gradeConfigs]
  );

  const [store] = useState(() => {
    const initialMap = new Map<string, CellState>();
    for (const g of initialGrades) {
      initialMap.set(cellKeyToString(g), { value: g.value, status: "idle" });
    }
    return new GradeStore(initialMap, onSaveGrade ?? mockSaveGrade);
  });

  const { registerRef, handleKeyDown } = useGridNavigation(
    students.length,
    sortedConfigs.length
  );

  const columnHelper = useMemo(() => createColumnHelper<StudentRow>(), []);

  const columns = useMemo(() => {
    const gradeColumns = sortedConfigs.map((gc, colIndex) =>
      columnHelper.display({
        id: `grade_${gc.id}`,
        header: () => (
          <div className="flex flex-col items-center px-1 py-1.5">
            <span className="text-xs font-medium text-[var(--color-foreground-muted)] truncate max-w-[96px]">
              {gc.name}
            </span>
            <span className="text-[10px] text-[var(--color-foreground-muted)]">
              peso {gc.weight} · máx {gc.maxScore}
            </span>
          </div>
        ),
        cell: (ctx) => (
          <GradeInputCell
            enrollmentId={ctx.row.original.enrollmentId}
            gradeConfig={gc}
            rowIndex={ctx.row.index}
            colIndex={colIndex}
            registerRef={registerRef}
            onKeyDown={handleKeyDown}
          />
        ),
      })
    );

    return [
      columnHelper.display({
        id: "student",
        header: () => <div className="px-3 py-1.5 text-xs font-medium text-[var(--color-foreground-muted)]">Aluno</div>,
        cell: (ctx) => <StudentCell student={ctx.row.original} />,
      }),
      ...gradeColumns,
      columnHelper.display({
        id: "attendance",
        header: () => (
          <div className="px-2 py-1.5 text-xs font-medium text-[var(--color-foreground-muted)] text-center">Freq.</div>
        ),
        cell: (ctx) => <AttendanceCell pct={ctx.row.original.attendancePct} />,
      }),
      columnHelper.display({
        id: "average",
        header: () => (
          <div className="px-2 py-1.5 text-xs font-medium text-[var(--color-foreground-muted)] text-center">Média</div>
        ),
        cell: (ctx) => (
          <AverageCell enrollmentId={ctx.row.original.enrollmentId} gradeConfigs={sortedConfigs} />
        ),
      }),
    ];
  }, [sortedConfigs, columnHelper, registerRef, handleKeyDown]);

  const table = useReactTable({
    data: students,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <GradeStoreContext.Provider value={store}>
      <div
        data-theme-surface
        className={`rounded-lg border ${className}`}
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead
              data-theme-surface
              className="sticky top-0 z-10 border-b"
              style={{ backgroundColor: "var(--color-surface-muted)", borderColor: "var(--color-border)" }}
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header, idx) => (
                    <th
                      key={header.id}
                      data-theme-surface
                      className="text-left font-normal"
                      style={
                        idx === 0
                          ? { position: "sticky", left: 0, zIndex: 20, backgroundColor: "var(--color-surface-muted)" }
                          : undefined
                      }
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-theme-surface
                  className="border-b last:border-b-0 hover:bg-[var(--color-surface-muted)]"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  {row.getVisibleCells().map((cell, idx) => (
                    <td
                      key={cell.id}
                      data-theme-surface
                      className="p-0"
                      style={
                        idx === 0 ? { position: "sticky", left: 0, zIndex: 10, backgroundColor: "var(--color-surface)" } : undefined
                      }
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legenda */}
        <div
          data-theme-surface
          className="flex flex-wrap items-center gap-3 px-3 py-2 border-t text-[11px] text-[var(--color-foreground-muted)]"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span className="font-medium text-[var(--color-foreground)]">Legenda:</span>
          {(["aprovado", "recuperacao", "reprovado", "pendente"] as GradeStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${STATUS_STYLES[s].badge}`} />
              {STATUS_STYLES[s].label}
            </span>
          ))}
          <span className="ml-auto hidden sm:inline">
            Navegue com{" "}
            <kbd
              className="px-1 py-0.5 rounded border"
              style={{ backgroundColor: "var(--color-surface-muted)", borderColor: "var(--color-border)" }}
            >
              Tab
            </kbd>
            ,{" "}
            <kbd
              className="px-1 py-0.5 rounded border"
              style={{ backgroundColor: "var(--color-surface-muted)", borderColor: "var(--color-border)" }}
            >
              Enter
            </kbd>{" "}
            ou as setas
          </span>
        </div>
      </div>
    </GradeStoreContext.Provider>
  );
}
