import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/with-tenant";
import { apiSuccess } from "@/lib/http/api-response";
import { badRequest, forbidden } from "@/lib/http/errors";
import { WRITE_ROLES } from "@/lib/roles";
import { requireAiAccess } from "@/services/ai/guard";
import { sendChatMessage, listChatHistory } from "@/services/ai/chat.service";
import { CHAT_COMMANDS, parseCommandContext, dispatchChatCommand } from "@/services/ai/chat-commands";

/**
 * POST /api/ai/chat — dois modos, mutuamente exclusivos (Etapa 8):
 *
 * 1. `{ message: string }` — pergunta em linguagem livre (comportamento
 *    original, inalterado): passa pela IA de chat com contexto do tenant.
 * 2. `{ command: string, context: {...} }` — "pílula de comando": roteamento
 *    DIRETO pra funcionalidade certa (Etapas 1-6), sem depender da IA
 *    interpretar intenção por linguagem natural. Cada comando tem seu
 *    próprio formato de `context` e seu próprio plan-gate — ver
 *    services/ai/chat-commands.ts (fonte única desta documentação).
 *
 * Comandos disponíveis e `context` esperado:
 * - "gerar_prova"       -> { text: string (>=50), subjectHint?: string }
 * - "gerar_flashcards"  -> { text: string (>=50), subjectHint?: string }
 * - "plano_aula"        -> { text: string (>=50), subjectHint?: string }
 * - "adaptar_texto"     -> { text: string (>=20), targetLevel: "FUNDAMENTAL"|"MEDIO"|"EJA" }
 * - "corrigir_redacao"  -> { text: string (>=50), criteriaPreset?: "ENEM", customCriteria?: string (>=10), studentLabel?: string } (criteriaPreset OU customCriteria, nunca os dois)
 * - "acessibilidade"    -> { text: string (>=30) }
 *
 * Nenhum comando aceita upload de imagem — pra gerar a partir de foto/scan,
 * o frontend chama o endpoint dedicado da feature diretamente (que já
 * aceita multipart com `image`). "Descrição de Imagens" (Etapa 7) não tem
 * pílula de comando por não fazer sentido sem upload de arquivo.
 *
 * GET /api/ai/chat — histórico recente da conversa (pra hidratar a UI).
 */

const bodySchema = z.object({
  message: z.string().trim().min(1).max(500).optional(),
  command: z.enum(CHAT_COMMANDS).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  // Omitido = cria conversa nova (ver sendChatMessage). Comandos ("pílulas")
  // não pertencem a uma conversa — sempre avulsos, por isso não usam isso.
  conversationId: z.string().min(1).optional(),
});

export const POST = withTenant(async (request, user) => {
  if (!WRITE_ROLES.has(user.role)) {
    throw forbidden("Sem permissão para usar o assistente de IA.");
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("Payload inválido.", parsed.error.flatten());
  }

  const { message, command, context, conversationId } = parsed.data;
  if (Boolean(message) === Boolean(command)) {
    throw badRequest("Informe `message` (pergunta livre) OU `command` + `context` (atalho estruturado), exatamente um dos dois.");
  }

  if (command) {
    const parsedContext = parseCommandContext(command, context);
    if (!parsedContext.success) {
      throw badRequest(`Contexto inválido para o comando "${command}".`, parsedContext.error.flatten());
    }
    const result = await dispatchChatCommand(command, parsedContext.data, { tenantId: user.tenantId, membershipId: user.id });
    if (result instanceof NextResponse) return result;
    return apiSuccess(result);
  }

  const accessBlock = await requireAiAccess(user.tenantId);
  if (accessBlock) return accessBlock;

  const result = await sendChatMessage({
    tenantId: user.tenantId,
    membershipId: user.id,
    message: message as string,
    conversationId,
  });

  return apiSuccess(result);
});

const getQuerySchema = z.object({
  conversationId: z.string().min(1, "conversationId é obrigatório."),
});

export const GET = withTenant(async (request: NextRequest, user) => {
  const { searchParams } = new URL(request.url);
  const parsed = getQuerySchema.safeParse({ conversationId: searchParams.get("conversationId") });
  if (!parsed.success) {
    throw badRequest("Parâmetros inválidos.", parsed.error.flatten());
  }
  const history = await listChatHistory(user.tenantId, user.id, parsed.data.conversationId);
  return apiSuccess(history);
});
