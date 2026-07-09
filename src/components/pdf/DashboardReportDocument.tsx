import { Document, Page, View, Text } from "@react-pdf/renderer";
import type { DashboardReport } from "@/repositories/dashboard-report.repository";
import { pdfStyles, PDF_FOOTER_TEXT } from "./shared-styles";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

export function DashboardReportDocument({ data }: { data: DashboardReport }) {
  return (
    <Document title={`Relatório do dashboard - ${data.tenantName}`}>
      <Page size="A4" style={pdfStyles.page} wrap>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.brand}>AVALIASMART</Text>
          <Text style={pdfStyles.schoolName}>{data.tenantName}</Text>
          <Text style={pdfStyles.docTitle}>
            Relatório Consolidado — Ano Letivo {data.academicYear ?? "—"} · gerado em {dateFormatter.format(new Date())}
          </Text>
        </View>

        {data.classes.length === 0 && <Text style={{ fontSize: 10, color: "#737373" }}>Nenhuma turma cadastrada no ano letivo ativo.</Text>}

        {data.classes.map((cls) => {
          const termNames = cls.subjects[0]?.termAverages.map((t) => t.termName) ?? [];
          const subjectColWidth = "22%";
          const termColWidth = termNames.length > 0 ? `${65 / termNames.length}%` : "0%";
          const attendanceColWidth = "13%";

          return (
            <View key={cls.className} wrap={false} style={{ marginBottom: 18 }}>
              <Text style={pdfStyles.sectionTitle}>
                {cls.className} — {cls.studentCount} alunos — frequência {cls.attendancePct.toFixed(0)}%
              </Text>

              <View style={pdfStyles.table}>
                <View style={pdfStyles.row}>
                  <Text style={[pdfStyles.headerCell, { width: subjectColWidth, textAlign: "left" }]}>Disciplina</Text>
                  {termNames.map((name) => (
                    <Text key={name} style={[pdfStyles.headerCell, { width: termColWidth }]}>
                      {name}
                    </Text>
                  ))}
                </View>

                {cls.subjects.map((subject) => (
                  <View style={pdfStyles.row} key={subject.subjectName}>
                    <View style={[pdfStyles.labelCell, { width: subjectColWidth }]}>
                      <Text style={{ fontSize: 9, fontWeight: 700 }}>{subject.subjectName}</Text>
                    </View>
                    {subject.termAverages.map((t, idx) => (
                      <View key={`${t.termName}-${idx}`} style={[pdfStyles.cell, { width: termColWidth }]}>
                        <Text>{t.average !== null ? t.average.toFixed(1) : "—"}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <Text style={pdfStyles.sectionTitle}>Pontos de atenção</Text>
        {data.attentionPoints.length === 0 ? (
          <Text style={{ fontSize: 9, color: "#737373" }}>Nenhum ponto de atenção no momento.</Text>
        ) : (
          <View style={pdfStyles.table}>
            <View style={pdfStyles.row}>
              <Text style={[pdfStyles.headerCell, { width: "35%", textAlign: "left" }]}>Aluno</Text>
              <Text style={[pdfStyles.headerCell, { width: "25%", textAlign: "left" }]}>Turma</Text>
              <Text style={[pdfStyles.headerCell, { width: "40%", textAlign: "left" }]}>Motivo</Text>
            </View>
            {data.attentionPoints.map((p, idx) => (
              <View style={pdfStyles.row} key={`${p.studentName}-${idx}`}>
                <View style={[pdfStyles.labelCell, { width: "35%" }]}>
                  <Text style={{ fontSize: 9 }}>{p.studentName}</Text>
                </View>
                <View style={[pdfStyles.labelCell, { width: "25%" }]}>
                  <Text style={{ fontSize: 9 }}>{p.className}</Text>
                </View>
                <View style={[pdfStyles.labelCell, { width: "40%" }]}>
                  <Text style={{ fontSize: 9 }}>{p.reason}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={pdfStyles.footer} render={PDF_FOOTER_TEXT} fixed />
      </Page>
    </Document>
  );
}
