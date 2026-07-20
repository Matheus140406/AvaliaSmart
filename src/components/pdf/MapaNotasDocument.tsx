import { Document, Page, View, Text, Font } from "@react-pdf/renderer";
import type { GradeStatus } from "@/lib/grades/calculations";
import { pdfStyles } from "@/components/pdf/shared-styles";

/**
 * Mapa de Notas — grade completo de uma disciplina/período: uma linha por
 * aluno, uma coluna por avaliação lançada (nota bruta) + média ponderada
 * final. É o export "papel" do que a GradeGrid já mostra em tela — mesma
 * regra de cálculo (computeWeightedAverage/classifyAverage), nada recalculado
 * diferente.
 */

export interface MapaNotasAssessmentColumn {
  name: string;
  maxScore: number;
}

export interface MapaNotasStudentRow {
  studentName: string;
  registrationCode: string | null;
  values: (number | null)[]; // mesma ordem de `data.assessments`
  average: number | null;
  status: GradeStatus;
}

export interface MapaNotasData {
  schoolName: string;
  className: string;
  subjectName: string;
  termName: string;
  assessments: MapaNotasAssessmentColumn[];
  students: MapaNotasStudentRow[];
}

const STATUS_TEXT_COLOR: Record<GradeStatus, string> = {
  aprovado: "#047857",
  recuperacao: "#b45309",
  reprovado: "#be123c",
  pendente: "#a3a3a3",
};

export function MapaNotasDocument({ data }: { data: MapaNotasData }) {
  const nameColWidth = "20%";
  const registrationColWidth = "10%";
  const assessmentColWidth = data.assessments.length > 0 ? `${54 / data.assessments.length}%` : "0%";
  const averageColWidth = "16%";

  return (
    <Document title={`Mapa de Notas - ${data.subjectName} - ${data.className}`}>
      <Page size="A4" orientation="landscape" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.schoolName}>{data.schoolName}</Text>
          <Text style={pdfStyles.docTitle}>
            Mapa de Notas — {data.subjectName} — {data.className} — {data.termName}
          </Text>
        </View>

        <View style={pdfStyles.table}>
          <View style={pdfStyles.row}>
            <Text style={[pdfStyles.headerCell, { width: nameColWidth, textAlign: "left" }]}>Aluno</Text>
            <Text style={[pdfStyles.headerCell, { width: registrationColWidth }]}>Matrícula</Text>
            {data.assessments.map((a) => (
              <Text key={a.name} style={[pdfStyles.headerCell, { width: assessmentColWidth }]}>
                {a.name} ({a.maxScore})
              </Text>
            ))}
            <Text style={[pdfStyles.headerCell, { width: averageColWidth }]}>Média</Text>
          </View>

          {data.students.map((student) => (
            <View style={pdfStyles.row} key={student.studentName}>
              <View style={[pdfStyles.labelCell, { width: nameColWidth }]}>
                <Text>{student.studentName}</Text>
              </View>
              <View style={[pdfStyles.cell, { width: registrationColWidth }]}>
                <Text>{student.registrationCode ?? "—"}</Text>
              </View>
              {student.values.map((v, i) => (
                <View key={i} style={[pdfStyles.cell, { width: assessmentColWidth }]}>
                  <Text>{v !== null ? v.toFixed(1) : "—"}</Text>
                </View>
              ))}
              <View style={[pdfStyles.cell, { width: averageColWidth }]}>
                <Text style={{ fontWeight: 700, color: STATUS_TEXT_COLOR[student.status] }}>
                  {student.average !== null ? student.average.toFixed(1) : "—"}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text
          style={pdfStyles.footer}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages} — gerado pelo AvaliaSmart`}
          fixed
        />
      </Page>
    </Document>
  );
}

Font.registerHyphenationCallback((word) => [word]);
