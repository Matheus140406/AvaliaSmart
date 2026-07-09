/**
 * Anonimização de nome de aluno pro chat de IA (Etapa 3) — troca nome real
 * por um identificador ("Aluno_1", "Aluno_2"...) ANTES de qualquer texto
 * sair pro provider (Anthropic/Gemini), e traduz de volta pro nome real na
 * resposta final antes de mostrar/persistir pro professor.
 *
 * Escopo: o único lugar que `getTenantSnapshot()` expõe nome de aluno é
 * `studentsNeedingAttention[].studentName` (turmas/disciplinas no snapshot
 * não carregam nome por aluno) — então mapear só esses nomes cobre 100% do
 * que entra no prompt via snapshot. `message` (pergunta do professor) e
 * `historyText` (conversa anterior) também passam pelo replace, porque
 * ambos podem mencionar o nome de um aluno já flagged.
 */

export interface ChatAnonymizer {
  toPseudonym: Map<string, string>;
  toReal: Map<string, string>;
}

export function buildChatAnonymizer(realNames: string[]): ChatAnonymizer {
  const toPseudonym = new Map<string, string>();
  const toReal = new Map<string, string>();
  let counter = 0;
  for (const raw of realNames) {
    const name = raw.trim();
    if (!name || toPseudonym.has(name)) continue;
    counter += 1;
    const pseudonym = `Aluno_${counter}`;
    toPseudonym.set(name, pseudonym);
    toReal.set(pseudonym, name);
  }
  return { toPseudonym, toReal };
}

/** Nomes mais longos primeiro — evita que um nome curto substitua só um pedaço de um nome maior antes da vez dele. */
function replaceKnownNames(text: string, map: Map<string, string>): string {
  if (map.size === 0) return text;
  let result = text;
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "gi"), map.get(key)!);
  }
  return result;
}

export function anonymizeForPrompt(text: string, anonymizer: ChatAnonymizer): string {
  return replaceKnownNames(text, anonymizer.toPseudonym);
}

export function deanonymizeReply(text: string, anonymizer: ChatAnonymizer): string {
  return replaceKnownNames(text, anonymizer.toReal);
}
