-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('RESUMO_DESEMPENHO', 'SUGESTAO_OBSERVACAO', 'CHAT_PERGUNTAS');

-- CreateEnum
CREATE TYPE "ObservationFeedback" AS ENUM ('POSITIVO', 'NEGATIVO');

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "success" BOOLEAN NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSummaryCache" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "dataVersion" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSummaryCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiObservationSuggestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "suggestions" JSONB NOT NULL,
    "feedback" "ObservationFeedback",
    "feedbackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiObservationSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageLog_tenantId_createdAt_idx" ON "AiUsageLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_tenantId_feature_createdAt_idx" ON "AiUsageLog"("tenantId", "feature", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiSummaryCache_tenantId_scopeType_scopeId_termId_key" ON "AiSummaryCache"("tenantId", "scopeType", "scopeId", "termId");

-- CreateIndex
CREATE INDEX "AiObservationSuggestion_tenantId_studentId_termId_idx" ON "AiObservationSuggestion"("tenantId", "studentId", "termId");

-- CreateIndex
CREATE INDEX "AiChatMessage_tenantId_membershipId_createdAt_idx" ON "AiChatMessage"("tenantId", "membershipId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

