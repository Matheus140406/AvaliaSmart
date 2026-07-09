"use client";

/**
 * Fluxo de import em 3 passos, como pedido no briefing:
 *   1. Upload — parse .xlsx/.csv/.ods no client (nenhum round-trip só pra ler o arquivo)
 *   2. Mapeamento — "Coluna A do Excel -> Nome do Aluno" etc., com um palpite automático
 *   3. Revisão — relatório de validação (células vazias, notas em formato inválido)
 *      antes de qualquer escrita no banco; só then o POST pro /api/import/commit acontece.
 *
 * Retrofit visual pro design system (tokens de tema, `Button`, `AnimatedCard`,
 * `OneIcon` no loading do OCR) — nenhuma lógica de negócio mudou aqui.
 */

import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import type {
  ColumnMapping,
  ImportContext,
  ImportTarget,
  MappedRow,
  ParsedSpreadsheet,
  ValidationIssue,
} from "@/types/import";
import { parseSpreadsheetFile } from "@/lib/import/parse-spreadsheet";
import { generateImportTemplate } from "@/lib/import/generate-template";
import { applyMapping, getMappingWarnings, hasBlockingErrors } from "@/lib/import/validate";
import { Download } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { AnimatedCard } from "@/components/motion/AnimatedCard";
import { OneIcon } from "@/components/one/OneIcon";
import { TRANSITION_MICRO, buttonTap, buttonHover } from "@/lib/motion";

type WizardStep = "upload" | "mapping" | "review" | "done";

export interface ImportWizardProps {
  context: ImportContext;
}

export default function ImportWizard({ context }: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("upload");
  const [parsed, setParsed] = useState<ParsedSpreadsheet | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  // Uma key por arquivo parseado, não por clique — se o usuário clicar
  // "Importar" duas vezes pro MESMO resultado de parse, as duas requisições
  // carregam a mesma key, e o backend garante que só uma delas grava de fato.
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const targetOptions = useMemo(() => buildTargetOptions(context.gradeConfigs), [context.gradeConfigs]);

  // Compartilhado entre "veio de planilha parseada no client" e "veio do OCR
  // no servidor" — as duas produzem o mesmo shape ParsedSpreadsheet, então
  // dali pra frente (mapeamento, validação, commit) é o mesmo código.
  const applyParsedResult = (result: ParsedSpreadsheet) => {
    setParsed(result);
    setMappings(
      result.headers.map((header) => ({
        sourceHeader: header,
        target: guessTarget(header, context.gradeConfigs),
      }))
    );
    setIdempotencyKey(crypto.randomUUID());
    setStep("mapping");
  };

  const handleFile = async (file: File) => {
    setParseError(null);
    try {
      const result = await parseSpreadsheetFile(file);
      if (result.rows.length === 0) {
        setParseError("A planilha não tem nenhuma linha de dados além do cabeçalho.");
        return;
      }
      applyParsedResult(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Não foi possível ler o arquivo.");
    }
  };

  const [ocrLoading, setOcrLoading] = useState(false);

  const handlePhoto = async (file: File) => {
    setParseError(null);
    setOcrLoading(true);
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("classSubjectId", context.classSubjectId);
      body.append("termId", context.termId);

      const response = await fetch("/api/ocr/process", { method: "POST", body });
      const responseBody = await response.json().catch(() => ({ success: false }));
      if (!response.ok || !responseBody.success) {
        throw new Error(responseBody.error ?? `Falha ao processar a foto (HTTP ${response.status}).`);
      }

      const result: ParsedSpreadsheet = responseBody.data;
      if (result.rows.length === 0) {
        setParseError("Não encontrei nenhuma linha reconhecível nessa foto. Tente com mais luz ou menos ângulo.");
        return;
      }
      applyParsedResult(result);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Não foi possível processar a foto.");
    } finally {
      setOcrLoading(false);
    }
  };

  const mappingWarnings = useMemo(() => getMappingWarnings(mappings), [mappings]);

  const { rows: mappedRows, issues } = useMemo((): { rows: MappedRow[]; issues: ValidationIssue[] } => {
    if (!parsed || step === "upload" || step === "mapping") return { rows: [], issues: [] };
    return applyMapping(parsed, mappings, context);
  }, [parsed, mappings, context, step]);

  const blockingErrors = hasBlockingErrors(issues);

  const updateMapping = (sourceHeader: string, target: ImportTarget) => {
    setMappings((prev) => prev.map((m) => (m.sourceHeader === sourceHeader ? { ...m, target } : m)));
  };

  const handleSubmit = async () => {
    if (!parsed || !idempotencyKey) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: context.classId,
          classSubjectId: context.classSubjectId,
          termId: context.termId,
          idempotencyKey,
          fileName: parsed.fileName,
          rows: mappedRows,
        }),
      });
      const body = await response.json().catch(() => ({ success: false }));
      if (!response.ok || !body.success) {
        throw new Error(body.error ?? `Falha ao importar (HTTP ${response.status}).`);
      }
      setImportedCount(
        typeof body.data?.studentsImported === "number" ? body.data.studentsImported : mappedRows.length
      );
      setStep("done");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Falha ao importar.");
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    setStep("upload");
    setParsed(null);
    setMappings([]);
    setParseError(null);
    setSubmitError(null);
    setImportedCount(null);
    setIdempotencyKey(null);
  };

  return (
    <div
      data-theme-surface
      className="rounded-lg border p-6"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface-raised)" }}
    >
      <StepIndicator current={step} />

      {step === "upload" && (
        <AnimatedCard key="upload">
          <UploadStep
            context={context}
            onFile={handleFile}
            onPhoto={handlePhoto}
            ocrLoading={ocrLoading}
            error={parseError}
          />
        </AnimatedCard>
      )}

      {step === "mapping" && parsed && (
        <AnimatedCard key="mapping">
          <MappingStep
            parsed={parsed}
            mappings={mappings}
            targetOptions={targetOptions}
            warnings={mappingWarnings}
            onChangeMapping={updateMapping}
            onBack={restart}
            onNext={() => setStep("review")}
          />
        </AnimatedCard>
      )}

      {step === "review" && (
        <AnimatedCard key="review">
          <ReviewStep
            totalRows={mappedRows.length}
            issues={issues}
            blockingErrors={blockingErrors}
            submitting={submitting}
            submitError={submitError}
            onBack={() => setStep("mapping")}
            onSubmit={handleSubmit}
          />
        </AnimatedCard>
      )}

      {step === "done" && (
        <AnimatedCard key="done">
          <DoneStep count={importedCount ?? 0} onImportAnother={restart} />
        </AnimatedCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Passo 1 — Upload
// ---------------------------------------------------------------------------

function UploadStep({
  context,
  onFile,
  onPhoto,
  ocrLoading,
  error,
}: {
  context: ImportContext;
  onFile: (file: File) => void;
  onPhoto: (file: File) => void;
  ocrLoading: boolean;
  error: string | null;
}) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  };

  const handlePhotoInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPhoto(file);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-dashed p-3" style={{ borderColor: "var(--color-border)" }}>
        <div>
          <p className="text-xs font-medium text-[var(--color-foreground)]">Não sabe o formato certo?</p>
          <p className="text-xs text-[var(--color-foreground-muted)]">
            Baixe o modelo já com as colunas certas pra essa turma/período, com um exemplo preenchido.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => generateImportTemplate(context)} className="shrink-0 gap-1.5">
          <Download size={14} /> Baixar modelo
        </Button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        data-theme-surface
        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center"
        style={{ borderColor: dragging ? "var(--color-brand)" : "var(--color-border)" }}
      >
        <p className="text-sm font-medium text-[var(--color-foreground)]">Arraste a planilha aqui</p>
        <p className="text-xs text-[var(--color-foreground-muted)]">.xlsx, .csv ou .ods — ou clique para escolher</p>
        {/*
          `motion.label` (não `<Button>`): precisa continuar sendo um
          `<label>` de verdade envolvendo o `<input type="file">` escondido
          — é a associação nativa label->control que abre o seletor de
          arquivo. Um `<button>` de verdade aninhado num `<label>` que já
          contém um `<input>` é HTML inválido (conteúdo interativo
          aninhado); aqui só o VISUAL do Button é replicado, com a mesma
          microinteração de hover/tap.
        */}
        <motion.label
          whileHover={buttonHover}
          whileTap={buttonTap}
          transition={TRANSITION_MICRO}
          className="mt-2 cursor-pointer rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          Escolher arquivo
          <input type="file" accept=".xlsx,.xls,.csv,.ods" className="hidden" onChange={handleInputChange} />
        </motion.label>
      </div>

      <div className="my-4 flex items-center gap-3 text-xs text-[var(--color-foreground-muted)]">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        ou
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <label
        data-theme-surface
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center
                    cursor-pointer transition-colors hover:bg-[var(--color-surface-muted)] ${
                      ocrLoading ? "pointer-events-none opacity-60" : ""
                    }`}
        style={{ borderColor: "var(--color-border)" }}
      >
        {ocrLoading ? (
          <OneIcon status="thinking" size={28} label="Lendo a foto" />
        ) : (
          <p className="text-sm font-medium text-[var(--color-foreground)]">Tirar ou enviar uma foto da lista de notas</p>
        )}
        <p className="text-xs text-[var(--color-foreground-muted)]">
          {ocrLoading
            ? "Isso leva alguns segundos."
            : "Papel, caderno ou planilha impressa — a IA extrai a tabela para você revisar"}
        </p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          capture="environment"
          className="hidden"
          disabled={ocrLoading}
          onChange={handlePhotoInputChange}
        />
      </label>

      {error && <p className="mt-3 text-xs text-rose-500">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Passo 2 — Mapeamento de colunas
// ---------------------------------------------------------------------------

interface MappingStepProps {
  parsed: ParsedSpreadsheet;
  mappings: ColumnMapping[];
  targetOptions: { value: ImportTarget; label: string }[];
  warnings: string[];
  onChangeMapping: (sourceHeader: string, target: ImportTarget) => void;
  onBack: () => void;
  onNext: () => void;
}

function MappingStep({
  parsed,
  mappings,
  targetOptions,
  warnings,
  onChangeMapping,
  onBack,
  onNext,
}: MappingStepProps) {
  const mappingByHeader = new Map(mappings.map((m) => [m.sourceHeader, m.target]));
  const hasNameMapped = mappings.some((m) => m.target === "NOME_ALUNO");

  return (
    <div>
      <p className="mb-4 text-sm text-[var(--color-foreground-muted)]">
        <span className="font-medium text-[var(--color-foreground)]">{parsed.fileName}</span> — {parsed.rows.length}{" "}
        linhas encontradas. Confirme para onde cada coluna vai.
      </p>

      <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-muted)] text-xs text-[var(--color-foreground-muted)]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Coluna do arquivo</th>
              <th className="px-3 py-2 text-left font-medium">Amostra</th>
              <th className="px-3 py-2 text-left font-medium">Mapear para</th>
            </tr>
          </thead>
          <tbody>
            {parsed.headers.map((header) => (
              <tr key={header} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-2 font-medium text-[var(--color-foreground)]">{header}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-[var(--color-foreground-muted)]">
                  {sampleValues(parsed, header)}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={mappingByHeader.get(header) ?? "IGNORAR"}
                    onChange={(e) => onChangeMapping(header, e.target.value as ImportTarget)}
                    className="input-field h-8 rounded-md px-2 text-sm"
                  >
                    {targetOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1">
          {warnings.map((w) => (
            <li key={w} className="text-xs text-amber-600">
              {w}
            </li>
          ))}
        </ul>
      )}
      {!hasNameMapped && (
        <p className="mt-3 text-xs text-rose-500">Mapeie uma coluna para &quot;Nome do Aluno&quot; para continuar.</p>
      )}

      <div className="mt-5 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onNext} disabled={!hasNameMapped}>
          Validar dados
        </Button>
      </div>
    </div>
  );
}

function sampleValues(parsed: ParsedSpreadsheet, header: string): string {
  const values = parsed.rows
    .map((r) => r[header])
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .slice(0, 3)
    .map(String);
  return values.length > 0 ? values.join(", ") : "—";
}

// ---------------------------------------------------------------------------
// Passo 3 — Revisão / relatório de validação
// ---------------------------------------------------------------------------

interface ReviewStepProps {
  totalRows: number;
  issues: ValidationIssue[];
  blockingErrors: boolean;
  submitting: boolean;
  submitError: string | null;
  onBack: () => void;
  onSubmit: () => void;
}

function ReviewStep({
  totalRows,
  issues,
  blockingErrors,
  submitting,
  submitError,
  onBack,
  onSubmit,
}: ReviewStepProps) {
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const visibleIssues = issues.slice(0, 50);

  return (
    <div>
      <div className="mb-4 flex gap-4 text-sm">
        <Stat label="Linhas" value={totalRows} tone="neutral" />
        <Stat label="Erros" value={errorCount} tone={errorCount > 0 ? "error" : "neutral"} />
        <Stat label="Avisos" value={warningCount} tone={warningCount > 0 ? "warning" : "neutral"} />
      </div>

      {issues.length === 0 ? (
        <p className="text-sm text-[var(--color-accent)]">Nenhum problema encontrado. Pronto para importar.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-muted)] text-xs text-[var(--color-foreground-muted)]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Linha</th>
                <th className="px-3 py-2 text-left font-medium">Coluna</th>
                <th className="px-3 py-2 text-left font-medium">Problema</th>
              </tr>
            </thead>
            <tbody>
              {visibleIssues.map((issue, idx) => (
                <tr key={idx} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2 text-[var(--color-foreground-muted)]">{issue.rowIndex + 2}</td>
                  <td className="px-3 py-2 text-[var(--color-foreground-muted)]">{issue.sourceHeader || "—"}</td>
                  <td className={`px-3 py-2 ${issue.severity === "error" ? "text-rose-500" : "text-amber-600"}`}>
                    {issue.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {issues.length > visibleIssues.length && (
            <p className="px-3 py-2 text-xs text-[var(--color-foreground-muted)]">
              +{issues.length - visibleIssues.length} outros problemas não exibidos.
            </p>
          )}
        </div>
      )}

      {blockingErrors && (
        <p className="mt-3 text-xs text-rose-500">
          Corrija os erros (não os avisos) antes de importar — volte ao mapeamento se for um problema de coluna.
        </p>
      )}
      {submitError && <p className="mt-3 text-xs text-rose-500">{submitError}</p>}

      <div className="mt-5 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Voltar ao mapeamento
        </Button>
        <Button onClick={onSubmit} disabled={blockingErrors || submitting || totalRows === 0}>
          {submitting ? (
            <span className="flex items-center gap-2">
              <OneIcon status="thinking" size={16} label="Importando" />
              Importando…
            </span>
          ) : (
            `Importar ${totalRows} alunos`
          )}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "error" | "warning" }) {
  const color =
    tone === "error"
      ? "text-rose-500"
      : tone === "warning"
        ? "text-amber-600"
        : "text-[var(--color-foreground)]";
  return (
    <div>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-[var(--color-foreground-muted)]">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Passo 4 — Concluído
// ---------------------------------------------------------------------------

function DoneStep({ count, onImportAnother }: { count: number; onImportAnother: () => void }) {
  return (
    <div className="py-6 text-center">
      <div className="mb-3 flex justify-center">
        <OneIcon status="done" size={40} />
      </div>
      <p className="text-sm font-medium text-[var(--color-accent)]">
        {count} {count === 1 ? "aluno importado" : "alunos importados"} com sucesso.
      </p>
      <Button variant="ghost" onClick={onImportAnother} className="mt-4">
        Importar outra planilha
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indicador de progresso
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: WizardStep }) {
  const steps: { key: WizardStep; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "mapping", label: "Mapeamento" },
    { key: "review", label: "Validação" },
    { key: "done", label: "Concluído" },
  ];
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <div className="mb-6 flex items-center gap-2 text-xs">
      {steps.map((s, idx) => (
        <div key={s.key} className="flex items-center gap-2">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full"
            style={{
              backgroundColor: idx <= currentIndex ? "var(--color-brand)" : "var(--color-surface-muted)",
              color: idx <= currentIndex ? "#ffffff" : "var(--color-foreground-muted)",
            }}
          >
            {idx + 1}
          </span>
          <span
            style={{ color: idx <= currentIndex ? "var(--color-foreground)" : "var(--color-foreground-muted)" }}
          >
            {s.label}
          </span>
          {idx < steps.length - 1 && <span className="mx-1 h-px w-6 bg-[var(--color-border)]" />}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTargetOptions(
  gradeConfigs: ImportContext["gradeConfigs"]
): { value: ImportTarget; label: string }[] {
  return [
    { value: "IGNORAR" as const, label: "Ignorar esta coluna" },
    { value: "NOME_ALUNO" as const, label: "Nome do Aluno" },
    { value: "MATRICULA" as const, label: "Matrícula" },
    ...gradeConfigs.map((gc) => ({
      value: `NOTA:${gc.id}` as ImportTarget,
      label: `Nota — ${gc.name}`,
    })),
  ];
}

function guessTarget(header: string, gradeConfigs: ImportContext["gradeConfigs"]): ImportTarget {
  const normalized = header.trim().toLowerCase();

  if (normalized.includes("nome")) return "NOME_ALUNO";
  if (normalized.includes("matríc") || normalized.includes("matric") || normalized.includes("código") || normalized.includes("codigo")) {
    return "MATRICULA";
  }

  const matchingConfig = gradeConfigs.find((gc) => normalized.includes(gc.name.trim().toLowerCase()));
  if (matchingConfig) return `NOTA:${matchingConfig.id}`;

  return "IGNORAR";
}
