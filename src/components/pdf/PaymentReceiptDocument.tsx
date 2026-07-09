import { Document, Page, View, Text } from "@react-pdf/renderer";
import { pdfStyles, PDF_FOOTER_TEXT } from "./shared-styles";

export interface PaymentReceiptPdfData {
  tenantName: string;
  gateway: string;
  externalPaymentId: string;
  planName: string;
  amountCents: number;
  paidAt: Date;
  receiptId: string;
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const GATEWAY_LABEL: Record<string, string> = {
  mercadopago: "Mercado Pago",
  asaas: "Asaas",
};

export function PaymentReceiptDocument({ data }: { data: PaymentReceiptPdfData }) {
  return (
    <Document title={`Comprovante de pagamento - ${data.tenantName}`}>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.brand}>AVALIASMART</Text>
          <Text style={pdfStyles.schoolName}>Comprovante de Pagamento</Text>
          <Text style={pdfStyles.docTitle}>Recibo nº {data.receiptId}</Text>
        </View>

        <View style={pdfStyles.table}>
          {[
            ["WORKSPACE", data.tenantName],
            ["PLANO", data.planName],
            ["VALOR", formatCurrency(data.amountCents)],
            ["DATA E HORA", dateTimeFormatter.format(data.paidAt)],
            ["FORMA DE PAGAMENTO", GATEWAY_LABEL[data.gateway] ?? data.gateway],
            ["ID DA TRANSAÇÃO", data.externalPaymentId],
          ].map(([label, value]) => (
            <View style={pdfStyles.row} key={label}>
              <View style={[pdfStyles.labelCell, { width: "35%", backgroundColor: "#fafafa" }]}>
                <Text style={{ fontSize: 8, color: "#525252", fontWeight: 700 }}>{label}</Text>
              </View>
              <View style={[pdfStyles.cell, { width: "65%", textAlign: "left" }]}>
                <Text style={{ fontSize: 10 }}>{value}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={{ fontSize: 8, color: "#a3a3a3", marginTop: 24 }}>
          Este comprovante confirma o pagamento processado pelo gateway indicado acima. Guarde-o para seus registros.
        </Text>

        <Text style={pdfStyles.footer} render={PDF_FOOTER_TEXT} fixed />
      </Page>
    </Document>
  );
}
