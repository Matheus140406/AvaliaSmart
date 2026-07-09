import { StyleSheet } from "@react-pdf/renderer";

/**
 * Estilo compartilhado pelos PDFs novos (resumo de IA, dashboard,
 * comprovante) — mesma identidade visual "simples e profissional" do
 * boletim já existente (components/pdf/BoletimDocument.tsx), extraído aqui
 * pra não duplicar a paleta/tipografia em cada documento. Sem logo em
 * imagem (não existe asset de logo no projeto ainda) — cabeçalho em texto,
 * mesmo padrão do boletim. Fácil de trocar por uma logo depois.
 */
export const pdfStyles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#171717" },
  header: { marginBottom: 16, borderBottom: "1 solid #e5e5e5", paddingBottom: 12 },
  brand: { fontSize: 9, color: "#a3a3a3", marginBottom: 2, letterSpacing: 0.5 },
  schoolName: { fontSize: 13, fontWeight: 700, marginBottom: 2 },
  docTitle: { fontSize: 10, color: "#737373" },
  infoRow: { flexDirection: "row", marginTop: 10, justifyContent: "space-between" },
  infoLabel: { fontSize: 7, color: "#a3a3a3", marginBottom: 1 },
  infoValue: { fontSize: 10, fontWeight: 700 },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginTop: 16, marginBottom: 8, color: "#171717" },
  table: { borderTop: "1 solid #e5e5e5", borderLeft: "1 solid #e5e5e5" },
  row: { flexDirection: "row" },
  headerCell: {
    padding: 6,
    fontSize: 8,
    fontWeight: 700,
    color: "#525252",
    backgroundColor: "#fafafa",
    borderRight: "1 solid #e5e5e5",
    borderBottom: "1 solid #e5e5e5",
    textAlign: "center",
  },
  cell: {
    padding: 6,
    borderRight: "1 solid #e5e5e5",
    borderBottom: "1 solid #e5e5e5",
    textAlign: "center",
    justifyContent: "center",
  },
  labelCell: {
    padding: 6,
    borderRight: "1 solid #e5e5e5",
    borderBottom: "1 solid #e5e5e5",
    justifyContent: "center",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    fontSize: 7,
    color: "#a3a3a3",
    textAlign: "center",
  },
});

export const PDF_FOOTER_TEXT = ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
  `Página ${pageNumber} de ${totalPages} — gerado pelo AvaliaSmart`;
