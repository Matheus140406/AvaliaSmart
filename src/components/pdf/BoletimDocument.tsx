import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import type { GradeStatus } from "@/lib/grades/calculations";
import { GRADE_STATUS_LABEL } from "@/lib/grades/calculations";

/**
 * Documento @react-pdf/renderer (não JSX-para-HTML — um subconjunto próprio
 * de componentes: View/Text/Page com Flexbox, sem CSS Grid nem seletores).
 * Escolhido em vez de Puppeteer de propósito: Puppeteer precisa do binário do
 * Chromium (~100MB), acima do limite de tamanho de função da Vercel (50MB no
 * runtime padrão) — @react-pdf/renderer roda puro em Node, sem esse problema.
 */

export interface BoletimTermAverage {
  termId: string;
  termName: string;
  average: number | null;
  filled: number;
  total: number;
}

export interface BoletimSubjectRow {
  subjectName: string;
  termAverages: BoletimTermAverage[];
  finalAverage: number | null;
  finalStatus: GradeStatus;
  attendancePct: number;
}

export interface BoletimData {
  schoolName: string;
  studentName: string;
  registrationCode: string | null;
  className: string;
  academicYear: number;
  terms: { id: string; name: string }[];
  subjects: BoletimSubjectRow[];
}

const STATUS_COLOR: Record<GradeStatus, string> = {
  aprovado: "#ecfdf5",
  recuperacao: "#fffbeb",
  reprovado: "#fff1f2",
  pendente: "#fafafa",
};

const STATUS_TEXT_COLOR: Record<GradeStatus, string> = {
  aprovado: "#047857",
  recuperacao: "#b45309",
  reprovado: "#be123c",
  pendente: "#a3a3a3",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#171717" },
  header: { marginBottom: 16, borderBottom: "1 solid #e5e5e5", paddingBottom: 12 },
  schoolName: { fontSize: 13, fontWeight: 700, marginBottom: 2 },
  docTitle: { fontSize: 10, color: "#737373" },
  infoRow: { flexDirection: "row", marginTop: 10, justifyContent: "space-between" },
  infoLabel: { fontSize: 7, color: "#a3a3a3", marginBottom: 1 },
  infoValue: { fontSize: 10, fontWeight: 700 },
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
  subjectCell: {
    padding: 6,
    borderRight: "1 solid #e5e5e5",
    borderBottom: "1 solid #e5e5e5",
    justifyContent: "center",
  },
  subjectName: { fontSize: 9, fontWeight: 700 },
  averageValue: { fontSize: 9, fontWeight: 700 },
  legend: { flexDirection: "row", gap: 12, marginTop: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendLabel: { fontSize: 7, color: "#737373" },
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

export function BoletimDocument({ data }: { data: BoletimData }) {
  const subjectColWidth = "22%";
  const termColWidth = data.terms.length > 0 ? `${52 / data.terms.length}%` : "0%";
  const finalColWidth = "13%";
  const attendanceColWidth = "13%";

  return (
    <Document title={`Boletim - ${data.studentName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.schoolName}>{data.schoolName}</Text>
          <Text style={styles.docTitle}>Boletim Escolar — Ano Letivo {data.academicYear}</Text>

          <View style={styles.infoRow}>
            <View>
              <Text style={styles.infoLabel}>ALUNO</Text>
              <Text style={styles.infoValue}>{data.studentName}</Text>
            </View>
            <View>
              <Text style={styles.infoLabel}>MATRÍCULA</Text>
              <Text style={styles.infoValue}>{data.registrationCode ?? "—"}</Text>
            </View>
            <View>
              <Text style={styles.infoLabel}>TURMA</Text>
              <Text style={styles.infoValue}>{data.className}</Text>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={[styles.headerCell, { width: subjectColWidth, textAlign: "left" }]}>Disciplina</Text>
            {data.terms.map((term) => (
              <Text key={term.id} style={[styles.headerCell, { width: termColWidth }]}>
                {term.name}
              </Text>
            ))}
            <Text style={[styles.headerCell, { width: finalColWidth }]}>Média Final</Text>
            <Text style={[styles.headerCell, { width: attendanceColWidth }]}>Frequência</Text>
          </View>

          {data.subjects.map((subject) => (
            <View style={styles.row} key={subject.subjectName}>
              <View style={[styles.subjectCell, { width: subjectColWidth }]}>
                <Text style={styles.subjectName}>{subject.subjectName}</Text>
              </View>

              {subject.termAverages.map((t) => (
                <View key={t.termId} style={[styles.cell, { width: termColWidth }]}>
                  <Text>{t.average !== null ? t.average.toFixed(1) : "—"}</Text>
                </View>
              ))}

              <View
                style={[styles.cell, { width: finalColWidth, backgroundColor: STATUS_COLOR[subject.finalStatus] }]}
              >
                <Text style={[styles.averageValue, { color: STATUS_TEXT_COLOR[subject.finalStatus] }]}>
                  {subject.finalAverage !== null ? subject.finalAverage.toFixed(1) : "—"}
                </Text>
              </View>

              <View style={[styles.cell, { width: attendanceColWidth }]}>
                <Text>{subject.attendancePct.toFixed(0)}%</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.legend}>
          {(Object.keys(GRADE_STATUS_LABEL) as GradeStatus[]).map((status) => (
            <View key={status} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: STATUS_TEXT_COLOR[status] }]} />
              <Text style={styles.legendLabel}>{GRADE_STATUS_LABEL[status]}</Text>
            </View>
          ))}
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages} — gerado pelo AvaliaSmart`}
          fixed
        />
      </Page>
    </Document>
  );
}

// Helvetica é uma das 14 fontes-base embutidas no próprio @react-pdf/renderer
// (não precisa de Font.register pra funcionar), mas desabilitar a
// hifenização automática evita quebra estranha de nomes próprios longos.
Font.registerHyphenationCallback((word) => [word]);
