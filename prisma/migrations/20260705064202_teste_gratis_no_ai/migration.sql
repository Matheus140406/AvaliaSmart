-- Etapa 4 da camada de IA: Teste Grátis NÃO tem acesso a nenhuma
-- funcionalidade de IA (resumo de desempenho, sugestão de observações,
-- chat de perguntas). Isso substitui a decisão anterior ("trial = features
-- completas") só pro flag aiAssistant — ocr e os demais flags do Teste
-- Grátis continuam como estavam.
UPDATE "Plan"
SET "features" = jsonb_set("features"::jsonb, '{aiAssistant}', 'false'::jsonb)
WHERE "tier" = 'TESTE_GRATIS';
