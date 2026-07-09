import type { AiFeature } from "@prisma/client";
import type { PlanFeatures } from "@/repositories/plan.repository";

/**
 * Registro único de todas as funcionalidades de IA do produto (Etapa 0 da
 * expansão de produtividade docente). Duas coisas vivem aqui, e só aqui:
 *
 * 1. Qual chave de `Plan.features` (JSON, no banco) gateia cada
 *    funcionalidade — QUEM tem acesso é 100% dado (mudar isso é um UPDATE na
 *    tabela `Plan`, nunca deploy de código).
 * 2. O "peso" de rate limit de cada uma (`light`/`heavy`) — usado por
 *    `requireAiFeature()` em guard.ts pra aplicar o teto extra das operações
 *    pesadas (ver Etapa 9: provas/plano de aula/correção de redação/descrição
 *    de imagem geram saída bem maior que um resumo ou flashcard).
 *
 * `aiAssistant` é a exceção 1:N do registro: já cobre 3 endpoints diferentes
 * (resumo, sugestão de observação, chat), cada um com seu próprio valor de
 * `AiFeature` pra auditoria — por isso `usageLogFeatures` é uma lista, não um
 * valor único. Todas as funcionalidades NOVAS (Etapas 1-7) são 1:1.
 */

export type AiFeatureFlag = keyof Pick<
  PlanFeatures,
  | "aiAssistant"
  | "examGenerator"
  | "flashcards"
  | "lessonPlan"
  | "textLevelAdapter"
  | "essayGrading"
  | "accessibility"
  | "imageDescription"
>;

export interface AiFeatureConfig {
  /** Nome curto exibido em mensagens de bloqueio e no catálogo de comandos do chat (Etapa 8). */
  label: string;
  /** "heavy" entra no teto extra de operações pesadas, além do teto geral. */
  weight: "light" | "heavy";
  /** Valores de AiUsageLog.feature que contam pra esta funcionalidade (rate limit + auditoria). */
  usageLogFeatures: AiFeature[];
}

export const AI_FEATURE_REGISTRY: Record<AiFeatureFlag, AiFeatureConfig> = {
  aiAssistant: {
    label: "Resumo de desempenho, sugestão de observação e chat pedagógico",
    weight: "light",
    usageLogFeatures: ["RESUMO_DESEMPENHO", "SUGESTAO_OBSERVACAO", "CHAT_PERGUNTAS"],
  },
  examGenerator: {
    label: "Gerador de provas/questionários",
    weight: "heavy",
    usageLogFeatures: ["GERADOR_PROVA"],
  },
  flashcards: {
    label: "Gerador de flashcards",
    weight: "light",
    usageLogFeatures: ["GERADOR_FLASHCARDS"],
  },
  lessonPlan: {
    label: "Plano de aula (BNCC)",
    weight: "heavy",
    usageLogFeatures: ["PLANO_AULA"],
  },
  textLevelAdapter: {
    label: "Adaptador de nível de texto",
    weight: "light",
    usageLogFeatures: ["ADAPTADOR_TEXTO"],
  },
  essayGrading: {
    label: "Correção de redação",
    weight: "heavy",
    usageLogFeatures: ["CORRECAO_REDACAO"],
  },
  accessibility: {
    label: "Acessibilidade (linguagem simples e mapa mental)",
    weight: "light",
    usageLogFeatures: ["ACESSIBILIDADE"],
  },
  imageDescription: {
    label: "Descrição de imagens (audiodescrição)",
    weight: "heavy",
    usageLogFeatures: ["DESCRICAO_IMAGEM"],
  },
};

export const HEAVY_USAGE_LOG_FEATURES: AiFeature[] = Object.values(AI_FEATURE_REGISTRY)
  .filter((c) => c.weight === "heavy")
  .flatMap((c) => c.usageLogFeatures);
