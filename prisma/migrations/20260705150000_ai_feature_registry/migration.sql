-- Etapa 0 da expansão da camada de IA: registro centralizado de features por
-- plano. Cada novo flag abaixo é checado em runtime contra `Plan.features`
-- (ver src/services/ai/feature-registry.ts + guard.ts) — remapear qualquer
-- feature entre planos é só um UPDATE nesta tabela, sem deploy de código.

-- AlterEnum: novos valores de AiFeature pra auditoria/rate-limit das 7 novas
-- funcionalidades. Só ADD VALUE (sem renomear/remover) — seguro de combinar
-- com o restante deste arquivo na mesma migration.
ALTER TYPE "AiFeature" ADD VALUE 'GERADOR_PROVA';
ALTER TYPE "AiFeature" ADD VALUE 'GERADOR_FLASHCARDS';
ALTER TYPE "AiFeature" ADD VALUE 'PLANO_AULA';
ALTER TYPE "AiFeature" ADD VALUE 'ADAPTADOR_TEXTO';
ALTER TYPE "AiFeature" ADD VALUE 'CORRECAO_REDACAO';
ALTER TYPE "AiFeature" ADD VALUE 'ACESSIBILIDADE';
ALTER TYPE "AiFeature" ADD VALUE 'DESCRICAO_IMAGEM';

-- Mapeamento inicial (ajustável depois, sem deploy):
-- Teste Grátis:      nenhuma feature de IA nova (já sem acesso a aiAssistant).
-- Mensal Base:       + Gerador de Provas + Flashcards.
-- Mensal Avançado:   + Plano de Aula (BNCC) + Adaptador de Nível de Texto + Correção de Redação.
-- Trimestral/Semestral: + Acessibilidade (linguagem simples/mapa mental) + Descrição de Imagens.
UPDATE "Plan" SET "features" = "features"::jsonb || '{
  "examGenerator": false,
  "flashcards": false,
  "lessonPlan": false,
  "textLevelAdapter": false,
  "essayGrading": false,
  "accessibility": false,
  "imageDescription": false
}'::jsonb
WHERE "tier" = 'TESTE_GRATIS';

UPDATE "Plan" SET "features" = "features"::jsonb || '{
  "examGenerator": true,
  "flashcards": true,
  "lessonPlan": false,
  "textLevelAdapter": false,
  "essayGrading": false,
  "accessibility": false,
  "imageDescription": false
}'::jsonb
WHERE "tier" = 'MENSAL_BASE';

UPDATE "Plan" SET "features" = "features"::jsonb || '{
  "examGenerator": true,
  "flashcards": true,
  "lessonPlan": true,
  "textLevelAdapter": true,
  "essayGrading": true,
  "accessibility": false,
  "imageDescription": false
}'::jsonb
WHERE "tier" = 'MENSAL_AVANCADO';

UPDATE "Plan" SET "features" = "features"::jsonb || '{
  "examGenerator": true,
  "flashcards": true,
  "lessonPlan": true,
  "textLevelAdapter": true,
  "essayGrading": true,
  "accessibility": true,
  "imageDescription": true
}'::jsonb
WHERE "tier" IN ('TRIMESTRAL', 'SEMESTRAL');
