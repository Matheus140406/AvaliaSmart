-- CreateTable
CREATE TABLE "ObservationTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ObservationTemplate_tenantId_createdAt_idx" ON "ObservationTemplate"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ObservationTemplate" ADD CONSTRAINT "ObservationTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservationTemplate" ADD CONSTRAINT "ObservationTemplate_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
