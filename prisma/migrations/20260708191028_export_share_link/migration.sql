-- CreateTable
CREATE TABLE "ExportShareLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExportShareLink_token_key" ON "ExportShareLink"("token");

-- CreateIndex
CREATE INDEX "ExportShareLink_expiresAt_idx" ON "ExportShareLink"("expiresAt");

-- AddForeignKey
ALTER TABLE "ExportShareLink" ADD CONSTRAINT "ExportShareLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
