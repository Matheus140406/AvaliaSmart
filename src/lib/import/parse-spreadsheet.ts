import * as XLSX from "xlsx";
import type { ParsedSpreadsheet } from "@/types/import";

const SUPPORTED_EXTENSIONS = [".xlsx", ".xls", ".csv", ".ods"];

export function isSupportedSpreadsheet(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Parseia .xlsx/.xls/.csv/.ods no client, sem round-trip pro servidor —
 * o SheetJS lida com os três formatos pela mesma API (`XLSX.read`), então
 * não precisamos de um parser por formato.
 */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  if (!isSupportedSpreadsheet(file)) {
    throw new Error(`Formato não suportado: ${file.name}. Use .xlsx, .csv ou .ods.`);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("O arquivo não tem nenhuma planilha/aba legível.");
  }
  const sheet = workbook.Sheets[firstSheetName];

  const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });

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
