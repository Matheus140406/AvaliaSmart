import { Document, Page, View, Text } from "@react-pdf/renderer";
import { pdfStyles, PDF_FOOTER_TEXT } from "./shared-styles";
import type { ExamContent } from "@/services/ai/exam-generator.service";

const OPTION_LETTERS = ["A", "B", "C", "D"];

export interface ExamPdfData {
  tenantName: string;
  exam: ExamContent;
  generatedAt: Date;
}

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

export function ExamDocument({ data }: { data: ExamPdfData }) {
  const { exam } = data;
  return (
    <Document title={exam.title}>
      <Page size="A4" style={pdfStyles.page} wrap>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.brand}>AVALIASMART</Text>
          <Text style={pdfStyles.schoolName}>{exam.title}</Text>
          <Text style={pdfStyles.docTitle}>{data.tenantName} — gerado em {dateFormatter.format(data.generatedAt)}</Text>
        </View>

        <Text style={{ fontSize: 8, color: "#a3a3a3", marginBottom: 12 }}>
          Conteúdo gerado por IA a partir de um documento fornecido pelo professor. Revise antes de aplicar.
        </Text>

        <Text style={pdfStyles.sectionTitle}>Questões de Múltipla Escolha</Text>
        {exam.multipleChoice.map((q, i) => (
          <View key={i} style={{ marginBottom: 10 }} wrap={false}>
            <Text style={{ fontSize: 9, fontWeight: 700, marginBottom: 4 }}>
              {i + 1}. {q.question}
            </Text>
            {q.options.map((opt, j) => (
              <Text key={j} style={{ fontSize: 9, marginLeft: 12, marginBottom: 2 }}>
                {OPTION_LETTERS[j]}) {opt}
              </Text>
            ))}
          </View>
        ))}

        <Text style={pdfStyles.sectionTitle}>Questões Discursivas</Text>
        {exam.essay.map((q, i) => (
          <View key={i} style={{ marginBottom: 10 }} wrap={false}>
            <Text style={{ fontSize: 9, fontWeight: 700, marginBottom: 4 }}>
              {i + 1}. {q.question}
            </Text>
          </View>
        ))}

        <Text style={pdfStyles.footer} render={PDF_FOOTER_TEXT} fixed />
      </Page>

      <Page size="A4" style={pdfStyles.page} wrap>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.brand}>AVALIASMART</Text>
          <Text style={pdfStyles.schoolName}>Gabarito e critérios de correção</Text>
          <Text style={pdfStyles.docTitle}>Uso exclusivo do professor — {exam.title}</Text>
        </View>

        <Text style={pdfStyles.sectionTitle}>Múltipla Escolha</Text>
        {exam.multipleChoice.map((q, i) => (
          <Text key={i} style={{ fontSize: 9, marginBottom: 4 }}>
            {i + 1}. Alternativa {OPTION_LETTERS[q.correctIndex]}
          </Text>
        ))}

        <Text style={pdfStyles.sectionTitle}>Discursivas — critérios de correção</Text>
        {exam.essay.map((q, i) => (
          <View key={i} style={{ marginBottom: 8 }} wrap={false}>
            <Text style={{ fontSize: 9, fontWeight: 700, marginBottom: 2 }}>{i + 1}. {q.question}</Text>
            <Text style={{ fontSize: 9, color: "#525252" }}>{q.gradingCriteria}</Text>
          </View>
        ))}

        <Text style={pdfStyles.footer} render={PDF_FOOTER_TEXT} fixed />
      </Page>
    </Document>
  );
}
