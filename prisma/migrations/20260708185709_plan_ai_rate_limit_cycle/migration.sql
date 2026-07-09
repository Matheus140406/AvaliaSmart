-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "aiRateLimitMaxCalls" INTEGER,
ADD COLUMN     "aiRateLimitWindowHours" INTEGER;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "aiCycleStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "aiUsedThisCycle" INTEGER NOT NULL DEFAULT 0;
