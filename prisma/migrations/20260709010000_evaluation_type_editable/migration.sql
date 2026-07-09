-- Troca o enum fixo EvaluationType por uma tabela EDITÁVEL POR TENANT
-- (cada escola pode adicionar/renomear/desativar seus próprios tipos de
-- avaliação depois, via /tipos-avaliacao — sem isso, uma nova categoria
-- sempre exigia deploy de código).

-- 1. Tabela nova
CREATE TABLE "EvaluationTypeOption" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "order"     INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationTypeOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvaluationTypeOption_tenantId_name_key" ON "EvaluationTypeOption"("tenantId", "name");
CREATE INDEX "EvaluationTypeOption_tenantId_active_idx" ON "EvaluationTypeOption"("tenantId", "active");

ALTER TABLE "EvaluationTypeOption" ADD CONSTRAINT "EvaluationTypeOption_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Semeia o conjunto padrão (os 7 antigos valores do enum + Seminário,
-- pedido nesta rodada) pra CADA tenant existente — dali em diante é só
-- dado, editável na tela nova.
INSERT INTO "EvaluationTypeOption" ("id", "tenantId", "name", "active", "order", "createdAt")
SELECT gen_random_uuid()::text, t."id", v."name", true, v."order", CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('Prova', 0),
  ('Trabalho', 1),
  ('Participação', 2),
  ('Projeto', 3),
  ('Recuperação', 4),
  ('Diagnóstica', 5),
  ('Seminário', 6),
  ('Outro', 7)
) AS v("name", "order");

-- 3. Coluna nova em GradeConfig (nullable até o backfill terminar)
ALTER TABLE "GradeConfig" ADD COLUMN "typeId" TEXT;

-- 4. Backfill: cada GradeConfig existente aponta pro EvaluationTypeOption
-- do MESMO tenant com o nome correspondente ao valor antigo do enum.
UPDATE "GradeConfig" gc
SET "typeId" = eto."id"
FROM "EvaluationTypeOption" eto, "ClassSubject" cs, "Class" c
WHERE gc."classSubjectId" = cs."id"
  AND cs."classId" = c."id"
  AND eto."tenantId" = c."tenantId"
  AND eto."name" = (
    CASE gc."type"
      WHEN 'PROVA' THEN 'Prova'
      WHEN 'TRABALHO' THEN 'Trabalho'
      WHEN 'PARTICIPACAO' THEN 'Participação'
      WHEN 'PROJETO' THEN 'Projeto'
      WHEN 'RECUPERACAO' THEN 'Recuperação'
      WHEN 'DIAGNOSTICA' THEN 'Diagnóstica'
      WHEN 'OUTRO' THEN 'Outro'
    END
  );

-- 5. Torna obrigatória + FK, agora que todo GradeConfig existente já tem typeId
ALTER TABLE "GradeConfig" ALTER COLUMN "typeId" SET NOT NULL;
CREATE INDEX "GradeConfig_typeId_idx" ON "GradeConfig"("typeId");
ALTER TABLE "GradeConfig" ADD CONSTRAINT "GradeConfig_typeId_fkey"
  FOREIGN KEY ("typeId") REFERENCES "EvaluationTypeOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Remove o enum antigo (nada mais referencia)
ALTER TABLE "GradeConfig" DROP COLUMN "type";
DROP TYPE "EvaluationType";
