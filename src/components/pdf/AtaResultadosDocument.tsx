import { Document, Page, View, Text, Font } from "@react-pdf/renderer";
import type { GradeStatus } from "@/lib/grades/calculations";
import { pdfStyles } from "@/components/pdf/shared-styles";

/**
 * Ata de Resultados Finais — registro formal de fim de período/ano: uma
 * linha por aluno, uma coluna por disciplina (média final já calculada,
 * mesma regra do boletim — ver computeFinalAverage em lib/grades/
 * calculations.ts), mais a situação final consolidada. Paisagem (landscape)
 * de propósito: com muitas disciplinas, retrato ficaria espremido demais.
 */

export interface AtaSubjectResult {
  average: number | null;
  status: GradeStatus;
}

export interface AtaStudentRow {
  studentName: string;
  registrationCode: string | null;
  subjects: AtaSubjectResult[]; // mesma ordem de `data.subjectNames`
  finalStatus: GradeStatus;
}

export interface AtaResultadosData {
  schoolName: string;
  className: string;
  academicYear: number;
  subjectNames: string[];
  students: AtaStudentRow[];
}

const STATUS_LABEL: Record<GradeStatus, string> = {
  aprovado: "Aprovado",
  recuperacao: "Recuperação",
  reprovado: "Reprovado",
  pendente: "Pendente",
};

const STATUS_TEXT_COLOR: Record<GradeStatus, string> = {
  aprovado: "#047857",
  recuperacao: "#b45309",
  reprovado: "#be123c",
  pendente: "#a3a3a3",
};

export function AtaResultadosDocument({ data }: { data: AtaResultadosData }) {
  const nameColWidth = "18%";
  const registrationColWidth = "10%";
  const subjectColWidth = data.subjectNames.length > 0 ? `${56 / data.subjectNames.length}%` : "0%";
  const finalColWidth = "16%";

  return (
    <Document title={`Ata de Resultados Finais - ${data.className}`}>
      <Page size="A4" orientation="landscape" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.schoolName}>{data.schoolName}</Text>
          <Text style={pdfStyles.docTitle}>
            Ata de Resultados Finais — {data.className} — Ano Letivo {data.academicYear}
          </Text>
        </View>

        <View style={pdfStyles.table}>
          <View style={pdfStyles.row}>
            <Text style={[pdfStyles.headerCell, { width: nameColWidth, textAlign: "left" }]}>Aluno</Text>
            <Text style={[pdfStyles.headerCell, { width: registrationColWidth }]}>Matrícula</Text>
            {data.subjectNames.map((name) => (
              <Text key={name} style={[pdfStyles.headerCell, { width: subjectColWidth }]}>
                {name}
              </Text>
            ))}
            <Text style={[pdfStyles.headerCell, { width: finalColWidth }]}>Situação Final</Text>
          </View>

          {data.students.map((student) => (
            <View style={pdfStyles.row} key={student.studentName}>
              <View style={[pdfStyles.labelCell, { width: nameColWidth }]}>
                <Text>{student.studentName}</Text>
              </View>
              <View style={[pdfStyles.cell, { width: registrationColWidth }]}>
                <Text>{student.registrationCode ?? "—"}</Text>
              </View>
              {student.subjects.map((s, i) => (
                <View key={i} style={[pdfStyles.cell, { width: subjectColWidth }]}>
                  <Text style={{ color: STATUS_TEXT_COLOR[s.status] }}>{s.average !== null ? s.average.toFixed(1) : "—"}</Text>
                </View>
              ))}
              <View style={[pdfStyles.cell, { width: finalColWidth }]}>
                <Text style={{ fontWeight: 700, color: STATUS_TEXT_COLOR[student.finalStatus] }}>
                  {STATUS_LABEL[student.finalStatus]}
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
