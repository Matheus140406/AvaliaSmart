import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { isSupportedSpreadsheet, parseSpreadsheetFile } from "@/lib/import/parse-spreadsheet";

function csvFile(content: string, name = "notas.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

function xlsxFile(rows: (string | number | null)[][], name = "notas.xlsx"): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Plan1");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("isSupportedSpreadsheet", () => {
  it("aceita .xlsx/.xls/.csv/.ods, inclusive com nome em maiúsculas", () => {
    for (const name of ["a.xlsx", "b.xls", "c.csv", "d.ods", "E.XLSX"]) {
      expect(isSupportedSpreadsheet(new File([""], name))).toBe(true);
    }
  });

  it("rejeita outras extensões", () => {
    for (const name of ["a.pdf", "b.txt", "c.xlsx.exe", "sem-extensao"]) {
      expect(isSupportedSpreadsheet(new File([""], name))).toBe(false);
    }
  });
});

describe("parseSpreadsheetFile", () => {
  it("lança erro claro pra formato não suportado", async () => {
    await expect(parseSpreadsheetFile(new File(["x"], "notas.pdf"))).rejects.toThrow(
      /Formato não suportado/
    );
  });

  it("parseia CSV com cabeçalho e linhas", async () => {
    const parsed = await parseSpreadsheetFile(csvFile("Aluno,Nota\nAna,8\nBruno,5.5\n"));
    expect(parsed.headers).toEqual(["Aluno", "Nota"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({ Aluno: "Ana", Nota: 8 });
    expect(parsed.fileName).toBe("notas.csv");
  });

  it("parseia .xlsx real (round-trip via SheetJS)", async () => {
    const parsed = await parseSpreadsheetFile(
      xlsxFile([
        ["Aluno", "Prova 1"],
        ["Ana", 9],
        ["Bruno", null],
      ])
    );
    expect(parsed.headers).toEqual(["Aluno", "Prova 1"]);
    expect(parsed.rows).toEqual([
      { Aluno: "Ana", "Prova 1": 9 },
      { Aluno: "Bruno", "Prova 1": null },
    ]);
  });

  it("deduplica cabeçalhos repetidos e nomeia colunas vazias", async () => {
    const parsed = await parseSpreadsheetFile(
      xlsxFile([
        ["Nota", "Nota", null, "Nota"],
        [1, 2, 3, 4],
      ])
    );
    expect(parsed.headers).toEqual(["Nota", "Nota (2)", "Coluna 3", "Nota (3)"]);
  });

  it("lança erro pra planilha vazia", async () => {
    await expect(parseSpreadsheetFile(csvFile(""))).rejects.toThrow(/vazia|nenhuma planilha/);
  });

  it("preenche células ausentes com null (linha mais curta que o cabeçalho)", async () => {
    const parsed = await parseSpreadsheetFile(csvFile("A,B,C\n1,2\n"));
    expect(parsed.rows[0]).toEqual({ A: 1, B: 2, C: null });
  });
});
