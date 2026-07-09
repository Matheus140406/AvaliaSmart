-- AlterTable
ALTER TABLE "AiEssayGrading" ADD COLUMN     "essayText" TEXT,
ADD COLUMN     "gradedBy" TEXT NOT NULL DEFAULT 'ai';

-- CreateIndex
CREATE INDEX "AiEssayGrading_tenantId_studentLabel_idx" ON "AiEssayGrading"("tenantId", "studentLabel");
