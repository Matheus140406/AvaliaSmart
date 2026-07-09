-- AlterTable
ALTER TABLE "Plan" ADD COLUMN "maxOcrPerMonth" INTEGER;

-- Preenche o teto de OCR/IA por plano (equivalente ao que existia nos
-- planos antigos, adaptado pra estrutura de 5 planos nova).
UPDATE "Plan" SET "maxOcrPerMonth" = 20  WHERE "tier" = 'TESTE_GRATIS';
UPDATE "Plan" SET "maxOcrPerMonth" = 50  WHERE "tier" = 'MENSAL_BASE';
UPDATE "Plan" SET "maxOcrPerMonth" = 150 WHERE "tier" = 'MENSAL_AVANCADO';
UPDATE "Plan" SET "maxOcrPerMonth" = 300 WHERE "tier" = 'TRIMESTRAL';
UPDATE "Plan" SET "maxOcrPerMonth" = NULL WHERE "tier" = 'SEMESTRAL';
