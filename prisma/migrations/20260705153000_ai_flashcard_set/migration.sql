-- CreateTable
CREATE TABLE "AiFlashcardSet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiFlashcardSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiFlashcardSet_tenantId_createdAt_idx" ON "AiFlashcardSet"("tenantId", "createdAt");
