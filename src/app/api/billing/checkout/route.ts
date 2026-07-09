import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { forbidden, badRequest, HttpError } from "@/lib/http/errors";
import { findPlanByTier } from "@/repositories/plan.repository";
import { asaasCycleFor, mercadoPagoFrequencyFor } from "@/lib/billing/cycle";
import { ensureAsaasCustomer, createAsaasSubscription, isAsaasConfigured } from "@/lib/billing/asaas";
import { createMercadoPagoSubscription, isMercadoPagoConfigured } from "@/lib/billing/mercadopago";

/**
 * POST /api/billing/checkout — cria a assinatura no gateway ativo e devolve
 * a URL de checkout hospedada ({ checkoutUrl }, mesma forma pros dois
 * gateways — o client não precisa saber qual está ativo).
 *
 * Gateway é escolhido por env, nessa ordem: Mercado Pago > Asaas > modo dev.
 * Rodar os dois gateways simultaneamente pro mesmo conjunto de planos criaria
 * um problema de reconciliação (duas fontes de verdade pra "esse tenant
 * pagou?") — então é uma troca, não uma soma. Trocar de gateway depois é só
 * mudar qual variável de ambiente está preenchida.
 *
 * O plano NÃO é aplicado aqui em nenhum dos dois: quem promove o tenant é o
 * respectivo webhook, quando o gateway confirma o pagamento. Pix avulso
 * (Etapa 3) é um endpoint separado — este aqui é só a assinatura recorrente.
 */

const checkoutSchema = z.object({
  tier: z.enum(["MENSAL_BASE", "MENSAL_AVANCADO", "TRIMESTRAL", "SEMESTRAL"]),
  payerName: z.string().trim().min(2).max(120),
  payerEmail: z.string().trim().toLowerCase().email(),
  // Exigido pelo Asaas (cliente pagador); Mercado Pago não usa neste fluxo,
  // mas mantemos o mesmo formulário pros dois gateways.
  cpfCnpj: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 0 || v.length === 11 || v.length === 14, "CPF (11 dígitos) ou CNPJ (14 dígitos).")
    .optional(),
});

export const POST = withTenant(async (request: NextRequest, user) => {
  if (user.role !== "ADMIN") {
    throw forbidden("Só administradores podem alterar o plano.");
  }

  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.", parsed.error.flatten());
  }
  const { tier, payerName, payerEmail, cpfCnpj } = parsed.data;

  const plan = await findPlanByTier(tier);
  if (!plan) throw badRequest("Plano não encontrado ou desativado.");

  const externalReference = `${user.tenantId}:${tier}`;

  // ----- Mercado Pago (prioridade se configurado) -----
  if (isMercadoPagoConfigured()) {
    try {
      const { frequencyType, frequencyCount } = mercadoPagoFrequencyFor(plan.durationDays);
      const { preapprovalId, initPoint } = await createMercadoPagoSubscription({
        payerEmail,
        reason: `AvaliaSmart — Plano ${plan.name}`,
        valueCents: plan.priceCentsTotal,
        frequencyType,
        frequencyCount,
        backUrl: `${request.nextUrl.origin}/planos`,
        externalReference,
      });

      await prisma.subscription.upsert({
        where: { tenantId: user.tenantId },
        create: { tenantId: user.tenantId, tier: "TESTE_GRATIS", status: "ATIVA", externalId: preapprovalId },
        update: { externalId: preapprovalId },
      });

      if (!initPoint) {
        throw new HttpError(502, "Assinatura criada, mas o link de pagamento não veio. Tente de novo.");
      }
      return apiSuccess({ checkoutUrl: initPoint });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(502, err instanceof Error ? err.message : "Falha ao comunicar com o Mercado Pago.");
    }
  }

  // ----- Asaas -----
  if (isAsaasConfigured()) {
    if (!cpfCnpj) {
      throw badRequest("CPF ou CNPJ é obrigatório.");
    }
    try {
      const existingSub = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId } });
      const customerId =
        existingSub?.customerExternalId ??
        (await ensureAsaasCustomer({ name: payerName, email: payerEmail, cpfCnpj }));

      const { subscriptionId, invoiceUrl } = await createAsaasSubscription({
        customerId,
        valueCents: plan.priceCentsTotal,
        cycle: asaasCycleFor(plan.durationDays),
        description: `AvaliaSmart — Plano ${plan.name}`,
        externalReference,
      });

      await prisma.subscription.upsert({
        where: { tenantId: user.tenantId },
        create: {
          tenantId: user.tenantId,
          tier: "TESTE_GRATIS",
          status: "ATIVA",
          externalId: subscriptionId,
          customerExternalId: customerId,
        },
        update: { externalId: subscriptionId, customerExternalId: customerId },
      });

      if (!invoiceUrl) {
        throw new HttpError(502, "Assinatura criada, mas a fatura ainda não está disponível. Tente de novo em instantes.");
      }
      return apiSuccess({ checkoutUrl: invoiceUrl });
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(502, err instanceof Error ? err.message : "Falha ao comunicar com o Asaas.");
    }
  }

  // ----- Modo dev (nenhum gateway configurado) -----
  if (process.env.NODE_ENV === "production") {
    throw new HttpError(501, "Pagamento não configurado: defina MERCADOPAGO_ACCESS_TOKEN ou ASAAS_API_KEY.");
  }
  const validUntil = new Date(Date.now() + plan.durationDays * 86_400_000);
  await prisma.subscription.upsert({
    where: { tenantId: user.tenantId },
    create: { tenantId: user.tenantId, tier, status: "ATIVA", currentPeriodEnd: validUntil },
    update: { tier, status: "ATIVA", trialEndsAt: null, currentPeriodEnd: validUntil },
  });
  return apiSuccess({ applied: true, tier, devMode: true });
});
