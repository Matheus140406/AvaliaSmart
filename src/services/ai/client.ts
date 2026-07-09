import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

/**
 * Clients dos 3 providers de IA do produto — todo o resto do serviço de IA
 * importa DAQUI, nunca instancia `createAnthropic`/`createGoogleGenerativeAI`/
 * `createOpenAI` de novo. Isso é o que torna trocar de modelo (ou adicionar
 * um provider novo) uma mudança em um lugar só.
 *
 * Nenhuma API key é exposta ao client-side — este arquivo só é importado
 * por código de servidor (services/, api routes), nunca por componentes
 * "use client".
 *
 * Ordem de tentativa (ver `ai.service.ts`): Gemini → OpenAI → Anthropic,
 * com circuit breaker por provider. Gemini vai primeiro por ser o único
 * com tier gratuito de verdade hoje; OpenAI e Anthropic são fallback pago
 * — `getOpenAIModel()`/`getGeminiModel()` voltam `null` se a respectiva
 * API key não estiver configurada (fallback vira no-op nesse caso, não erro).
 */

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * - claude-haiku-4-5 (default): custo baixo, volume alto — resumos e
 *   observações de boletim não precisam de raciocínio pesado.
 * - claude-sonnet-5: mais qualidade, custo maior — trocar via env var
 *   quando a qualidade do Haiku não for suficiente pra alguma feature.
 */
const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

export function getAnthropicModel(modelOverride?: string) {
  return anthropic(modelOverride ?? DEFAULT_ANTHROPIC_MODEL);
}

const gemini = process.env.GEMINI_API_KEY
  ? createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

export function getGeminiModel(modelOverride?: string) {
  if (!gemini) return null;
  return gemini(modelOverride ?? DEFAULT_GEMINI_MODEL);
}

const openai = process.env.OPENAI_API_KEY ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export function getOpenAIModel(modelOverride?: string) {
  if (!openai) return null;
  return openai(modelOverride ?? DEFAULT_OPENAI_MODEL);
}
