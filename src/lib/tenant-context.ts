import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Por que isso precisa existir: `prisma` em `lib/prisma.ts` é um singleton
 * compartilhado entre TODAS as requisições (é assim que se evita esgotar o
 * pool de conexões em serverless). Isso significa que não dá pra simplesmente
 * "gravar o tenantId atual numa variável" — a próxima requisição, de outro
 * usuário, pisaria nela.
 *
 * AsyncLocalStorage resolve isso: cada requisição roda dentro do seu próprio
 * "contexto" isolado, e código em qualquer profundidade da call stack (rotas,
 * lib/grades/serialize.ts, a Prisma Client Extension) consegue ler o contexto
 * da requisição ATUAL sem que ele precise ser passado como parâmetro em toda
 * função — nem vaza pra outras requisições concorrentes.
 *
 * Só funciona no runtime Node.js (não no Edge) — o que já é o nosso caso,
 * já que o Prisma padrão também exige Node.js (ver correção do item 4).
 */

export interface TenantContext {
  tenantId: string;
  membershipId: string;
  ip?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(context: TenantContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}
