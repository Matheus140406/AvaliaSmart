import { Document, Page, View, Text, Font } from "@react-pdf/renderer";
import { pdfStyles } from "@/components/pdf/shared-styles";
import type { MonthlyAttendanceReport } from "@/services/attendance.service";

/**
 * Export "papel" da lista de chamada do mês (Etapa 11) — mesmo princípio do
 * Mapa de Notas: uma linha por aluno, uma coluna por dia que teve chamada
 * lançada. P = presente, F = falta, J = falta justificada.
 */

const MARK_COLOR: Record<"P" | "F" | "J", string> = {
  P: "#047857",
  F: "#be123c",
  J: "#b45309",
};

export function AttendanceSheetDocument({ data, schoolName }: { data: MonthlyAttendanceReport; schoolName: string }) {
  const nameColWidth = "24%";
  const registrationColWidth = "10%";
  const dayColWidth = data.days.length > 0 ? `${46 / data.days.length}%` : "0%";
  const summaryColWidth = "10%";

  return (
    <Document title={`Lista de Chamada - ${data.subjectName} - ${data.className} - ${data.monthLabel}`}>
      <Page size="A4" orientation="landscape" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.schoolName}>{schoolName}</Text>
          <Text style={pdfStyles.docTitle}>
            Lista de Chamada — {data.subjectName} — {data.className} — {data.monthLabel}
          </Text>
        </View>

        {data.days.length === 0 ? (
          <Text style={{ fontSize: 9, color: "#737373" }}>Nenhuma chamada lançada neste mês.</Text>
        ) : (
          <View style={pdfStyles.table}>
            <View style={pdfStyles.row}>
              <Text style={[pdfStyles.headerCell, { width: nameColWidth, textAlign: "left" }]}>Aluno</Text>
              <Text style={[pdfStyles.headerCell, { width: registrationColWidth }]}>Matrícula</Text>
              {data.days.map((d) => (
                <Text key={d} style={[pdfStyles.headerCell, { width: dayColWidth }]}>
                  {d}
                </Text>
              ))}
              <Text style={[pdfStyles.headerCell, { width: summaryColWidth }]}>Faltas</Text>
              <Text style={[pdfStyles.headerCell, { width: summaryColWidth }]}>Freq.</Text>
            </View>

            {data.students.map((student) => (
              <View style={pdfStyles.row} key={student.studentName}>
                <View style={[pdfStyles.labelCell, { width: nameColWidth }]}>
                  <Text>{student.studentName}</Text>
                </View>
                <View style={[pdfStyles.cell, { width: registrationColWidth }]}>
                  <Text>{student.registrationCode ?? "—"}</Text>
                </View>
                {data.days.map((d) => (
                  <View key={d} style={[pdfStyles.cell, { width: dayColWidth }]}>
                    <Text style={{ fontWeight: 700, color: student.marksByDay[d] ? MARK_COLOR[student.marksByDay[d]] : "#d4d4d4" }}>
                      {student.marksByDay[d] ?? "—"}
                    </Text>
                  </View>
                ))}
                <View style={[pdfStyles.cell, { width: summaryColWidth }]}>
                  <Text>{student.totalAbsences}</Text>
                </View>
                <View style={[pdfStyles.cell, { width: summaryColWidth }]}>
                  <Text>{student.attendancePct.toFixed(0)}%</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={{ marginTop: 10, fontSize: 7, color: "#a3a3a3" }}>P = Presente · F = Falta · J = Falta justificada</Text>

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
