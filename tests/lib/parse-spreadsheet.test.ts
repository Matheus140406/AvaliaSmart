import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { isSupportedSpreadsheet, parseSpreadsheetFile } from "@/lib/import/parse-spreadsheet";

function csvFile(content: string, name = "notas.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

async function xlsxFile(rows: (string | number | null)[][], name = "notas.xlsx"): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Plan1");
  for (const row of rows) {
    sheet.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("isSupportedSpreadsheet", () => {
  it("aceita .xlsx e .csv, inclusive com nome em maiúsculas", () => {
    for (const name of ["a.xlsx", "c.csv", "E.XLSX", "F.CSV"]) {
      expect(isSupportedSpreadsheet(new File([""], name))).toBe(true);
    }
  });

  it("rejeita .xls/.ods (descontinuados na saída do SheetJS) e outras extensões", () => {
    for (const name of ["b.xls", "d.ods", "a.pdf", "b.txt", "c.xlsx.exe", "sem-extensao"]) {
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

  it("orienta conversão pra .xls/.ods (formatos que o parser antigo aceitava)", async () => {
    await expect(parseSpreadsheetFile(new File(["x"], "notas.xls"))).rejects.toThrow(
      /salve como \.xlsx ou \.csv/
    );
    await expect(parseSpreadsheetFile(new File(["x"], "notas.ods"))).rejects.toThrow(
      /salve como \.xlsx ou \.csv/
    );
  });

  it("lança erro claro pra .xlsx corrompido", async () => {
    await expect(parseSpreadsheetFile(new File(["lixo total"], "notas.xlsx"))).rejects.toThrow(
      /corrompido|não é um \.xlsx/
    );
  });

  it("parseia CSV com cabeçalho e linhas, coercendo números", async () => {
    const parsed = await parseSpreadsheetFile(csvFile("Aluno,Nota\nAna,8\nBruno,5.5\n"));
    expect(parsed.headers).toEqual(["Aluno", "Nota"]);
    expect(parsed.rows).toEqual([
      { Aluno: "Ana", Nota: 8 },
      { Aluno: "Bruno", Nota: 5.5 },
    ]);
    expect(parsed.fileName).toBe("notas.csv");
  });

  it("parseia CSV com aspas, vírgula dentro do campo e aspas escapadas", async () => {
    const parsed = await parseSpreadsheetFile(
      csvFile('Aluno,Observação\n"Souza, Ana","disse ""presente"" cedo"\n')
    );
    expect(parsed.rows[0]).toEqual({ Aluno: "Souza, Ana", Observação: 'disse "presente" cedo' });
  });

  it("ignora linhas totalmente vazias do CSV", async () => {
    const parsed = await parseSpreadsheetFile(csvFile("A,B\n1,2\n,,\n\n3,4\n"));
    expect(parsed.rows).toHaveLength(2);
  });

  it("parseia .xlsx real (round-trip via exceljs)", async () => {
    const parsed = await parseSpreadsheetFile(
      await xlsxFile([
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
      await xlsxFile([
        ["Nota", "Nota", null, "Nota"],
        [1, 2, 3, 4],
      ])
    );
    expect(parsed.headers).toEqual(["Nota", "Nota (2)", "Coluna 3", "Nota (3)"]);
  });

  it("lança erro pra planilha vazia", async () => {
    await expect(parseSpreadsheetFile(csvFile(""))).rejects.toThrow(/vazia/);
    await expect(parseSpreadsheetFile(await xlsxFile([]))).rejects.toThrow(/vazia/);
  });

  it("preenche células ausentes com null (linha mais curta que o cabeçalho)", async () => {
    const parsed = await parseSpreadsheetFile(csvFile("A,B,C\n1,2\n"));
    expect(parsed.rows[0]).toEqual({ A: 1, B: 2, C: null });
  });
});
