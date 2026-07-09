-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDENTE', 'ACEITO', 'EXPIRADO', 'REVOGADO');

-- AlterEnum: renomeia os valores de PlanTier preservando os dados já
-- gravados (ex: a Subscription do tenant seed "Escola Demo", hoje em
-- TRIAL). Mapeamento: TRIAL->TESTE_GRATIS, BASICO->MENSAL_BASE,
-- PRO->MENSAL_AVANCADO, ANUAL->SEMESTRAL.
BEGIN;
CREATE TYPE "PlanTier_new" AS ENUM ('TESTE_GRATIS', 'MENSAL_BASE', 'MENSAL_AVANCADO', 'TRIMESTRAL', 'SEMESTRAL');
ALTER TABLE "Subscription" ALTER COLUMN "tier" DROP DEFAULT;
ALTER TABLE "Subscription" ALTER COLUMN "tier" TYPE "PlanTier_new" USING (
  CASE "tier"::text
    WHEN 'TRIAL' THEN 'TESTE_GRATIS'
    WHEN 'BASICO' THEN 'MENSAL_BASE'
    WHEN 'PRO' THEN 'MENSAL_AVANCADO'
    WHEN 'ANUAL' THEN 'SEMESTRAL'
  END::"PlanTier_new"
);
ALTER TYPE "PlanTier" RENAME TO "PlanTier_old";
ALTER TYPE "PlanTier_new" RENAME TO "PlanTier";
DROP TYPE "PlanTier_old";
ALTER TABLE "Subscription" ALTER COLUMN "tier" SET DEFAULT 'TESTE_GRATIS';
COMMIT;

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDENTE',
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "tier" "PlanTier" NOT NULL,
    "name" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "maxUsers" INTEGER,
    "maxClasses" INTEGER,
    "maxStudents" INTEGER,
    "priceCentsTotal" INTEGER NOT NULL,
    "priceCentsMonthlyEquiv" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE INDEX "Invite_tenantId_status_idx" ON "Invite"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Invite_email_idx" ON "Invite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_tier_key" ON "Plan"("tier");

-- CreateIndex
CREATE INDEX "Plan_active_idx" ON "Plan"("active");

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed dos 5 planos: dado de negócio que precisa existir em TODO ambiente
-- (não só localmente via seed.ts, que só roda em dev). ON CONFLICT torna
-- este INSERT seguro de reexecutar.
INSERT INTO "Plan" ("id","tier","name","durationDays","maxUsers","maxClasses","maxStudents","priceCentsTotal","priceCentsMonthlyEquiv","features","active") VALUES
  ('plan_teste_gratis',   'TESTE_GRATIS',    'Teste Grátis',     5,   1,  NULL, NULL,  0,      0,      '{"ocr":true,"aiAssistant":true,"riskPrediction":true,"advancedExports":true,"prioritySupport":true}', true),
  ('plan_mensal_base',    'MENSAL_BASE',     'Mensal Base',      30,  3,  5,    200,   9900,   9900,   '{"ocr":true,"aiAssistant":true,"riskPrediction":true,"advancedExports":true,"prioritySupport":true}', true),
  ('plan_mensal_avancado','MENSAL_AVANCADO', 'Mensal Avançado',  30,  10, 20,   800,   24900,  24900,  '{"ocr":true,"aiAssistant":true,"riskPrediction":true,"advancedExports":true,"prioritySupport":true}', true),
  ('plan_trimestral',     'TRIMESTRAL',      'Trimestral',       90,  15, 30,   1200,  67200,  22400,  '{"ocr":true,"aiAssistant":true,"riskPrediction":true,"advancedExports":true,"prioritySupport":true}', true),
  ('plan_semestral',      'SEMESTRAL',       'Semestral',        180, 30, NULL, NULL,  119400, 19900,  '{"ocr":true,"aiAssistant":true,"riskPrediction":true,"advancedExports":true,"prioritySupport":true}', true)
ON CONFLICT ("tier") DO NOTHING;
