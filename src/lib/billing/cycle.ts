/**
 * Deriva o ciclo de cobrança recorrente de cada gateway a partir de
 * `Plan.durationDays` — evita cada rota reimplementar essa tabela.
 * Só usado pro fluxo de assinatura recorrente (/preapproval do MP,
 * /subscriptions do Asaas); o Pix avulso (Etapa 3) não usa isso.
 */
export function asaasCycleFor(durationDays: number): "MONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY" {
  if (durationDays <= 31) return "MONTHLY";
  if (durationDays <= 92) return "QUARTERLY";
  if (durationDays <= 183) return "SEMIANNUALLY";
  return "YEARLY";
}

export function mercadoPagoFrequencyFor(durationDays: number): { frequencyType: "months" | "years"; frequencyCount: number } {
  if (durationDays >= 365) return { frequencyType: "years", frequencyCount: Math.round(durationDays / 365) };
  return { frequencyType: "months", frequencyCount: Math.max(1, Math.round(durationDays / 30)) };
}
