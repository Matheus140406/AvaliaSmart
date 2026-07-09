-- Reprecificação 2026 (decisão de negócio do usuário). Sem grandfathering:
-- confirmado com o usuário que hoje não há assinante pago ativo em nenhum
-- tier, então não existe contrato antigo a proteger — os novos valores
-- valem imediatamente pra qualquer assinatura (nova ou futura) em cada tier.
--
-- priceCentsMonthlyEquiv = priceCentsTotal / (durationDays / 30), usado só
-- pra exibição no toggle "Mensal" da tela de Planos (equivalente mensal do
-- pré-pago) — Trimestral não fecha exato em centavos (27200/3 = 9066.67),
-- arredondado pro centavo mais próximo.

UPDATE "Plan" SET "priceCentsTotal" = 9900,  "priceCentsMonthlyEquiv" = 9900  WHERE "tier" = 'MENSAL_BASE';
UPDATE "Plan" SET "priceCentsTotal" = 16990, "priceCentsMonthlyEquiv" = 16990 WHERE "tier" = 'MENSAL_AVANCADO';
UPDATE "Plan" SET "priceCentsTotal" = 27200, "priceCentsMonthlyEquiv" = 9067  WHERE "tier" = 'TRIMESTRAL';
UPDATE "Plan" SET "priceCentsTotal" = 67500, "priceCentsMonthlyEquiv" = 11250 WHERE "tier" = 'SEMESTRAL';
