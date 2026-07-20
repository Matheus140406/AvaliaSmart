import { generateText, generateObject, type Schema, type LanguageModel } from "ai";

/** Extraído da própria assinatura de `generateText` — evita depender de um export interno do pacote `ai` que muda de versão pra versão. */
type ProviderOptions = Parameters<typeof generateText>[0]["providerOptions"];
import type { z } from "zod";
import { getAnthropicModel, getGeminiModel, getOpenAIModel } from "./client";

/**
 * Ponto de entrada ÚNICO pra qualquer chamada de IA no produto — resumo de
 * desempenho, sugestão de observação, chat de perguntas, gerador de prova,
 * plano de aula, correção de redação, OCR e mais todas passam por
 * `generate()`. Centralizar dá timeout/fallback/circuit-breaker
 * consistentes e um lugar só pra trocar de modelo ou provider sem duplicar
 * código em cada feature.
 *
 * NUNCA lança exceção — se todos os providers falharem ou o timeout
 * estourar, devolve `{success:false}` com uma mensagem amigável. Quem
 * chama decide o que fazer (mostrar erro, tentar de novo), mas o fluxo
 * principal do usuário (lançar nota, ver boletim) nunca quebra por causa
 * da IA. A ASSINATURA (params de entrada, `GenerateResult` de saída) é
 * estável — os 11 chamadores atuais (chat, resumo de desempenho, sugestão
 * de observação, gerador de prova, plano de aula, correção de redação,
 * OCR, flashcards, descrição de imagem, adaptador de texto, acessibilidade)
 * não precisaram de nenhum ajuste nesta rodada, só o INTERIOR mudou.
 *
 * Passar `schema` troca `generateText` por `generateObject` — mesma
 * função, mesma garantia de timeout/fallback, só a forma da saída muda.
 * Os 3 providers suportam os dois modos (ver `attempt()`).
 *
 * ---
 * ROTEAMENTO DE 3 PROVIDERS COM CIRCUIT BREAKER (substituindo o fallback
 * fixo Anthropic→Gemini de antes):
 *
 * Ordem: Gemini → OpenAI → Anthropic. Gemini vai primeiro por ser o único
 * com tier gratuito de verdade hoje (Anthropic está sem crédito, OpenAI é
 * 100% pago) — ver `client.ts`. Cada provider tem seu próprio circuit
 * breaker: se a chamada falhar por cota/crédito/rate-limit, o provider
 * fica "bloqueado" por 60s (não tenta de novo nesse provider até o bloqueio
 * expirar), e a chamada segue pro PRÓXIMO provider da lista imediatamente
 * — mais rápido e mais robusto que o retry-no-mesmo-provider que existia
 * aqui antes (reproduzido ao vivo numa rodada anterior: Gemini sozinho
 * tem só 5 req/min no tier gratuito, então um retry de alguns segundos no
 * MESMO provider raramente ajudava; ter OpenAI como opção real no meio
 * resolve isso de verdade, quando configurado).
 *
 * Erro que NÃO for cota/crédito (ex: prompt inválido, erro de validação)
 * propaga direto — não tenta os outros providers escondendo um erro real
 * atrás de um fallback inútil.
 *
 * `getGeminiModel()`/`getOpenAIModel()` voltam `null` se a respectiva API
 * key não estiver configurada — nesse caso o provider é pulado em
 * silêncio (nem conta como "tentativa", não aciona circuit breaker),
 * igual ao comportamento de fallback opcional que já existia pro Gemini.
 */

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const CIRCUIT_BREAKER_BLOCK_MS = 60 * 1000;

export type SupportedImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

interface BaseParams {
  /** Instrução de sistema — papel/tom/regras do assistente pra esta chamada. */
  system?: string;
  /** Prompt do usuário — já deve conter só o contexto estritamente necessário (ver Etapa 5). */
  prompt: string;
  /**
   * Anexa uma imagem à mensagem (visão) — usado pelas features que recebem
   * foto/scan (extração de texto de documento, correção de redação,
   * descrição de imagem). Quando presente, `prompt` vira o texto que
   * acompanha a imagem na mesma mensagem, em vez de um prompt solto.
   */
  image?: { data: string; mediaType: SupportedImageMediaType };
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Sobrescreve o modelo padrão do provider que acabar sendo tentado (ex: forçar outro modelo numa feature específica). Nenhum chamador usa isto hoje. */
  model?: string;
}

export interface GenerateTextParams extends BaseParams {
  schema?: undefined;
}

export interface GenerateObjectParams<T> extends BaseParams {
  schema: z.ZodType<T> | Schema<T>;
}

export interface GenerateSuccess<T> {
  success: true;
  data: T;
  usage: { inputTokens: number; outputTokens: number };
}

export interface GenerateFailure {
  success: false;
  error: string;
}

export type GenerateResult<T> = GenerateSuccess<T> | GenerateFailure;

type ProviderName = "gemini" | "openai" | "anthropic";

/**
 * Log de roteamento/latência da IA — barulhento demais pra rodar em toda
 * request de produção; liga com AI_DEBUG=1 quando precisar investigar o
 * fallback. `console.warn`/`console.error` (erros reais) continuam sempre
 * ativos.
 */
function aiDebug(message: string): void {
  if (process.env.AI_DEBUG === "1") {
    // eslint-disable-next-line no-console
    console.log(message);
  }
}

const PROVIDER_ORDER: ProviderName[] = ["gemini", "openai", "anthropic"];

const circuitBreakers: Record<ProviderName, { blockedUntil: number }> = {
  gemini: { blockedUntil: 0 },
  openai: { blockedUntil: 0 },
  anthropic: { blockedUntil: 0 },
};

function isProviderAvailable(provider: ProviderName): boolean {
  return Date.now() > circuitBreakers[provider].blockedUntil;
}

function blockProvider(provider: ProviderName): void {
  circuitBreakers[provider].blockedUntil = Date.now() + CIRCUIT_BREAKER_BLOCK_MS;
  console.warn(`[AI-FALLBACK] Circuit breaker ATIVADO para ${provider.toUpperCase()}. Ignorando por 60s.`);
}

function getModelForProvider(provider: ProviderName, modelOverride?: string): LanguageModel | null {
  if (provider === "gemini") return getGeminiModel(modelOverride);
  if (provider === "openai") return getOpenAIModel(modelOverride);
  return getAnthropicModel(modelOverride);
}

/** Statuses HTTP e texto de erro que indicam "sem cota/crédito agora", não um bug — mesmo critério usado pra decidir se aciona o circuit breaker (continua pro próximo provider) ou propaga o erro direto. */
function isQuotaOrRateLimitError(err: unknown): boolean {
  const statusCode = statusCodeOf(err);
  if (statusCode === 429 || statusCode === 402) return true;

  const message = errorMessageOf(err).toLowerCase();
  const quotaKeywords = ["quota", "rate limit", "insufficient funds", "credit", "billing", "exceeded", "resource_exhausted"];
  return quotaKeywords.some((keyword) => message.includes(keyword));
}

function statusCodeOf(err: unknown, depth = 0): number | undefined {
  if (depth > 3 || !err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  if (typeof e.statusCode === "number") return e.statusCode;
  if (typeof e.status === "number") return e.status;
  const response = e.response as Record<string, unknown> | undefined;
  if (response && typeof response.status === "number") return response.status;
  // `AI_RetryError` (SDK) embrulha o erro real de cada tentativa em `.lastError`.
  if (e.lastError) return statusCodeOf(e.lastError, depth + 1);
  return undefined;
}

function errorMessageOf(err: unknown): string {
  if (err instanceof Error) {
    const lastError = (err as { lastError?: unknown }).lastError;
    const lastErrorMessage = lastError instanceof Error ? lastError.message : "";
    return `${err.message} ${lastErrorMessage}`;
  }
  return String(err);
}

async function attempt<T>(
  model: LanguageModel,
  params: GenerateTextParams | GenerateObjectParams<T>,
  maxOutputTokens: number,
  providerOptions?: ProviderOptions
): Promise<GenerateResult<string> | GenerateResult<T>> {
  const abortSignal = AbortSignal.timeout(params.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  // Com imagem, o conteúdo vai em `messages` (multimodal) — o SDK não aceita
  // `prompt` e `messages` juntos. Sem imagem, mantém `prompt` simples (path
  // já testado em produção pelas features de texto existentes).
  const contentArgs = params.image
    ? {
        messages: [
          {
            role: "user" as const,
            content: [
              { type: "image" as const, image: params.image.data, mediaType: params.image.mediaType },
              { type: "text" as const, text: params.prompt },
            ],
          },
        ],
      }
    : { prompt: params.prompt };

  // `maxRetries: 1` (padrão do SDK é 2, ou seja, 3 tentativas no total) —
  // um erro de cota esgotada não se resolve tentando de novo no MESMO
  // provider em segundos; com o circuit breaker agora decidindo quando
  // pular pro PRÓXIMO provider, não faz sentido também bancar retries
  // longos aqui dentro. Mantém 1 (não 0) só pra cobrir um blip de rede
  // genuíno.
  if (params.schema) {
    const { object, usage } = await generateObject({
      model,
      system: params.system,
      ...contentArgs,
      schema: params.schema,
      maxOutputTokens,
      abortSignal,
      providerOptions,
      maxRetries: 1,
    });
    return {
      success: true,
      data: object,
      usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
    };
  }

  const { text, usage, finishReason } = await generateText({
    model,
    system: params.system,
    ...contentArgs,
    maxOutputTokens,
    abortSignal,
    providerOptions,
    maxRetries: 1,
  });

  // Diagnóstico: respostas chegando visivelmente cortadas no meio da frase
  // (reproduzido ao vivo, tenant real) — `finishReason` diz o motivo de
  // verdade ("length" = estourou maxOutputTokens, "content-filter" =
  // filtro do provider, "stop" = o próprio modelo decidiu parar aí).
  // Só log por enquanto, não muda o resultado.
  if (finishReason !== "stop") {
    console.warn(`[ai.service] finishReason inesperado: "${finishReason}" — texto (${text.length} chars): "${text}"`);
  }

  return {
    success: true,
    data: text.trim(),
    usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
  };
}

export async function generate(params: GenerateTextParams): Promise<GenerateResult<string>>;
export async function generate<T>(params: GenerateObjectParams<T>): Promise<GenerateResult<T>>;
export async function generate<T>(
  params: GenerateTextParams | GenerateObjectParams<T>
): Promise<GenerateResult<string> | GenerateResult<T>> {
  const maxOutputTokens = params.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  let anyProviderTried = false;
  let anyProviderBlocked = false;

  for (const provider of PROVIDER_ORDER) {
    if (!isProviderAvailable(provider)) {
      aiDebug(`[AI-ROUTING] Pulando ${provider.toUpperCase()} (circuit breaker ativo).`);
      anyProviderBlocked = true;
      continue;
    }

    const model = getModelForProvider(provider, params.model);
    if (!model) continue; // Provider sem API key configurada — pulo silencioso, não conta como tentativa.

    // `thinkingBudget: 0` só pra chamadas de TEXTO no Gemini (chat) —
    // reproduzido ao vivo um timeout do fallback numa chamada de chat
    // real; o modelo por trás de "gemini-flash-latest" gasta tokens de
    // "pensamento" internos por padrão, e desligar isso reduz a latência.
    // Pra chamadas com `schema` (generateObject), NÃO desligar: reproduzido
    // ao vivo um loop de repetição no feedback livre até estourar
    // `maxOutputTokens` especificamente com essa opção — desligar o
    // "raciocínio" desestabiliza saída estruturada maior.
    const providerOptions: ProviderOptions | undefined =
      provider === "gemini" && !params.schema ? { google: { thinkingConfig: { thinkingBudget: 0 } } } : undefined;

    anyProviderTried = true;
    try {
      aiDebug(`[AI-TRY] Tentando chamada via ${provider.toUpperCase()}...`);
      const start = Date.now();
      const result = await attempt(model, params, maxOutputTokens, providerOptions);
      const duration = Date.now() - start;
      const usage = result.success ? result.usage : undefined;
      aiDebug(
        `[AI-SUCCESS] Provider: ${provider.toUpperCase()} | Duração: ${duration}ms | Tokens: ${usage ? usage.inputTokens + usage.outputTokens : "N/A"}`
      );
      return result;
    } catch (err) {
      console.error(`[AI-ERROR] Falha no provedor ${provider.toUpperCase()}:`, err instanceof Error ? err.message : err);

      if (isQuotaOrRateLimitError(err)) {
        blockProvider(provider);
        continue;
      }

      // Erro que NÃO é de cota/crédito (prompt inválido, erro de
      // validação, etc.) — propaga direto, sem tentar os outros
      // providers escondendo um erro real atrás de um fallback inútil.
      // "Propagar" aqui significa devolver falha imediatamente pro
      // chamador de `generate()` (que nunca recebe uma exceção, só
      // `{success:false}`), não continuar o loop.
      return {
        success: false,
        error: "Não foi possível gerar a resposta de IA agora. Tente novamente em instantes.",
      };
    }
  }

  if (!anyProviderTried && !anyProviderBlocked) {
    console.error("[AI-FALLBACK] Nenhum provider de IA está configurado (nenhuma API key definida).");
  } else {
    console.error("[AI-FALLBACK] Todos os provedores de IA falharam ou estão fora de serviço por falta de cota.");
  }

  return {
    success: false,
    error: "Muitos pedidos de IA em sequência — aguarde um minuto e tente de novo.",
  };
}
