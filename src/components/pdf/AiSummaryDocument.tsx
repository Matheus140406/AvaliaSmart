import { Document, Page, View, Text } from "@react-pdf/renderer";
import { pdfStyles, PDF_FOOTER_TEXT } from "./shared-styles";

export interface AiSummaryPdfData {
  tenantName: string;
  scopeLabel: string; // "Turma" ou "Aluno"
  scopeName: string; // nome da turma ou do aluno
  termName: string;
  generatedAt: Date;
  summary: string;
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

export function AiSummaryDocument({ data }: { data: AiSummaryPdfData }) {
  return (
    <Document title={`Resumo de desempenho - ${data.scopeName}`}>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.brand}>AVALIASMART</Text>
          <Text style={pdfStyles.schoolName}>{data.tenantName}</Text>
          <Text style={pdfStyles.docTitle}>Resumo de Desempenho (gerado por IA) — {data.termName}</Text>

          <View style={pdfStyles.infoRow}>
            <View>
              <Text style={pdfStyles.infoLabel}>{data.scopeLabel.toUpperCase()}</Text>
              <Text style={pdfStyles.infoValue}>{data.scopeName}</Text>
            </View>
            <View>
              <Text style={pdfStyles.infoLabel}>GERADO EM</Text>
              <Text style={pdfStyles.infoValue}>{dateFormatter.format(data.generatedAt)}</Text>
            </View>
          </View>
        </View>

        <Text style={{ fontSize: 11, lineHeight: 1.5 }}>{data.summary}</Text>

        <Text style={{ fontSize: 7, color: "#a3a3a3", marginTop: 24 }}>
          Este resumo foi gerado automaticamente por inteligência artificial a partir das notas e frequência
          lançadas no sistema. Revise antes de usar em decisões pedagógicas.
        </Text>

        <Text style={pdfStyles.footer} render={PDF_FOOTER_TEXT} fixed />
      </Page>
    </Document>
  );
}
