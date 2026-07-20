-- CreateEnum
CREATE TYPE "RiskAlertType" AS ENUM ('MEDIA_BAIXA', 'FREQUENCIA_BAIXA');

-- CreateTable
CREATE TABLE "RiskAlertLog" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "riskType" "RiskAlertType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiskAlertLog_enrollmentId_termId_riskType_key" ON "RiskAlertLog"("enrollmentId", "termId", "riskType");
