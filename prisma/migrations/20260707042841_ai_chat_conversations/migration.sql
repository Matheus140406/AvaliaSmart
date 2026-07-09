-- CreateTable
CREATE TABLE "AiChatConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiChatConversation_pkey" PRIMARY KEY ("id")
);

-- AlterTable (nullable primeiro — a tabela já tem linhas; vira NOT NULL só
-- depois do backfill abaixo criar uma conversa "Conversa anterior" por
-- (tenantId, membershipId) e associar as mensagens existentes a ela)
ALTER TABLE "AiChatMessage" ADD COLUMN     "conversationId" TEXT;

-- Backfill: uma AiChatConversation por (tenantId, membershipId) que já
-- tinha mensagem, com createdAt/updatedAt herdados do intervalo real das
-- mensagens (não "agora"). Título fixo "Conversa anterior" — título
-- derivado da 1ª pergunta só passa a existir pra conversas NOVAS, criadas
-- depois desta migration, via código da aplicação.
INSERT INTO "AiChatConversation" ("id", "tenantId", "membershipId", "title", "createdAt", "updatedAt")
SELECT
    md5(random()::text || clock_timestamp()::text || "tenantId" || "membershipId"),
    "tenantId",
    "membershipId",
    'Conversa anterior',
    MIN("createdAt"),
    MAX("createdAt")
FROM "AiChatMessage"
GROUP BY "tenantId", "membershipId";

-- Associa cada mensagem existente à conversa criada pro seu (tenantId, membershipId)
UPDATE "AiChatMessage" m
SET "conversationId" = c."id"
FROM "AiChatConversation" c
WHERE m."tenantId" = c."tenantId"
  AND m."membershipId" = c."membershipId"
  AND c."title" = 'Conversa anterior'
  AND m."conversationId" IS NULL;

-- Agora que toda linha existente tem conversationId, vira NOT NULL de verdade
ALTER TABLE "AiChatMessage" ALTER COLUMN "conversationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "AiChatConversation_tenantId_membershipId_updatedAt_idx" ON "AiChatConversation"("tenantId", "membershipId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiChatMessage_conversationId_createdAt_idx" ON "AiChatMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
