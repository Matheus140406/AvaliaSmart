import ExcelJS from "exceljs";
import type { ParsedSpreadsheet } from "@/types/import";

/**
 * Parse client-side, sem round-trip pro servidor. Antes usava SheetJS
 * (`xlsx@0.18.5`), abandonado por vulnerabilidades sem fix publicado no npm
 * (CVE-2023-30533 prototype pollution + CVE-2024-22363 ReDoS) justo no
 * caminho que processa arquivo enviado pelo usuário. `exceljs` já era
 * dependência do projeto (export server-side) e cobre .xlsx; .csv ganhou um
 * parser próprio abaixo. REGRESSÃO DOCUMENTADA: .xls (legado) e .ods, que o
 * SheetJS lia, deixam de ser aceitos — quem tiver um arquivo desses converte
 * pra .xlsx/.csv em qualquer planilha antes de importar.
 */

const SUPPORTED_EXTENSIONS = [".xlsx", ".csv"];
const DROPPED_EXTENSIONS = [".xls", ".ods"];

export function isSupportedSpreadsheet(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const name = file.name.toLowerCase();
  if (!isSupportedSpreadsheet(file)) {
    if (DROPPED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      throw new Error(
        `O formato de ${file.name} não é mais aceito. Abra o arquivo em qualquer planilha e salve como .xlsx ou .csv antes de importar.`
      );
    }
    throw new Error(`Formato não suportado: ${file.name}. Use .xlsx ou .csv.`);
  }

  const raw = name.endsWith(".csv")
    ? parseCsv(await file.text())
    : await parseXlsx(await file.arrayBuffer());

  if (raw.length === 0) {
    throw new Error("A planilha está vazia.");
  }

  const [headerRow, ...dataRows] = raw;
  const headers = dedupeHeaders(headerRow);

  const rows = dataRows.map((row) => {
    const record: Record<string, string | number | null> = {};
    headers.forEach((header, idx) => {
      const cell = row[idx];
      record[header] = cell === undefined ? null : cell;
    });
    return record;
  });

  return { fileName: file.name, headers, rows };
}

/** Lê a primeira aba de um .xlsx como matriz de células, pulando linhas totalmente vazias (mesmo comportamento do parser antigo). */
async function parseXlsx(buffer: ArrayBuffer): Promise<(string | number | null)[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error("Não foi possível ler o arquivo — ele está corrompido ou não é um .xlsx válido.");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("O arquivo não tem nenhuma planilha/aba legível.");
  }

  const rows: (string | number | null)[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    // row.values é 1-based (índice 0 sempre vazio) — descarta o primeiro.
    // Array.from em vez de .map: o array é ESPARSO (célula vazia = buraco),
    // e .map pularia os buracos em vez de convertê-los pra null.
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(Array.from(values, (value) => normalizeCell(value as ExcelJS.CellValue)));
  });
  return rows;
}

/** Achata os tipos de célula do exceljs (fórmula, rich text, hyperlink, data) pro shape string|number|null do wizard. */
function normalizeCell(value: ExcelJS.CellValue): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) {
      return normalizeCell(value.result as ExcelJS.CellValue);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("error" in value) return null;
  }
  return String(value);
}

/**
 * CSV (RFC 4180): campos com aspas, aspas duplicadas escapadas, quebras de
 * linha dentro de aspas, \r\n ou \n. Números viram number (o SheetJS fazia
 * essa coerção; o restante do wizard depende dela pras colunas de nota).
 */
function parseCsv(text: string): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Linha totalmente vazia não vira registro (equivalente ao blankrows:false antigo).
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row.map(coerceCsvCell));
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    pushRow();
  }

  return rows;
}

function coerceCsvCell(cell: string): string | number | null {
  const trimmed = cell.trim();
  if (trimmed === "") return null;
  // Vírgula decimal (padrão brasileiro) não é convertida aqui de propósito —
  // o SheetJS também não convertia; a normalização pt-BR acontece na etapa
  // de validação do wizard.
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

/** Garante nomes de coluna únicos e legíveis, mesmo com cabeçalhos vazios ou repetidos. */
function dedupeHeaders(headerRow: (string | number | null)[]): string[] {
  const seen = new Map<string, number>();

  return headerRow.map((raw, idx) => {
    const base =
      raw === null || raw === undefined || String(raw).trim() === ""
        ? `Coluna ${idx + 1}`
        : String(raw).trim();

    const occurrences = seen.get(base) ?? 0;
    seen.set(base, occurrences + 1);
    return occurrences === 0 ? base : `${base} (${occurrences + 1})`;
  });
}
