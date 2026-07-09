import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getTenantContext } from "@/lib/tenant-context";

/**
 * Prisma 7: o motor de conexão embutido foi removido — `new PrismaClient()`
 * sem adapter agora lança erro. `PrismaPg` é o adapter oficial pra Postgres
 * (embrulha um Pool do node-postgres). A URL vem do mesmo DATABASE_URL de
 * sempre; só o jeito de passar pro client mudou.
 */
function createAdapter() {
  return new PrismaPg({ connectionString: process.env.DATABASE_URL });
}

// ---------------------------------------------------------------------------
// EXTENSION 1 — Tenant scoping automático (inalterada desde a introdução)
// ---------------------------------------------------------------------------

/**
 * Modelos que têm coluna `tenantId` direta. A extension só filtra esses —
 * não porque os outros não sejam multi-tenant, mas porque eles são escopados
 * TRANSITIVAMENTE (ex.: Grade -> Enrollment -> Class -> tenantId), e injetar
 * um filtro nesse nível exigiria reescrever o `where` com joins, o que é
 * arriscado o suficiente pra preferir manter explícito nas rotas em vez de
 * "mágico" aqui.
 */
const TENANT_SCOPED_MODELS = new Set([
  "Membership",
  "Student",
  "Guardian",
  "AcademicYear",
  "Class",
  "Subject",
  "NotificationTemplate",
  "ImportHistory",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectTenantFilter(model: string, args: any) {
  if (!TENANT_SCOPED_MODELS.has(model)) return args;

  const ctx = getTenantContext();
  // Sem contexto (seed, migração, código fora de withTenant) -> não filtra.
  // Essa extension é uma camada A MAIS de defesa, não a única.
  if (!ctx) return args;

  return { ...args, where: { ...args?.where, tenantId: ctx.tenantId } };
}

// ---------------------------------------------------------------------------
// EXTENSION 2 — AuditLog automático em mutações
// ---------------------------------------------------------------------------

/**
 * Modelos cujas mutações geram AuditLog automaticamente. AuditLog e
 * NotificationLog ficam de fora de propósito (auditar a escrita do próprio
 * audit = recursão infinita; logs de notificação são operacionais, não dado
 * pedagógico).
 */
const AUDITED_MODELS = new Set([
  "Grade",
  "Attendance",
  "Class",
  "Subject",
  "ClassSubject",
  "Student",
  "Enrollment",
  "GradeConfig",
  "Membership",
  "Guardian",
  "Term",
  "AcademicYear",
]);

type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "UPSERT"
  | "DELETE"
  | "BATCH_CREATE"
  | "BATCH_UPDATE"
  | "BATCH_DELETE";

/**
 * Client "cru" usado só pra: (a) gravar o AuditLog em si, (b) ler o valor
 * anterior antes de UPDATE/DELETE. Não passa pelas extensions — evita
 * recursão e evita que o filtro de tenant interfira na leitura do old value.
 */
let rawClient: PrismaClient | null = null;
function getRawClient(): PrismaClient {
  if (!rawClient) {
    rawClient = new PrismaClient({ adapter: createAdapter(), log: ["error"] });
  }
  return rawClient;
}

const MAX_BATCH_SAMPLE = 10;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toJsonSafe(value: any): any {
  if (value === undefined) return null;
  // Decimal do Prisma, Date, etc. serializam via toJSON no stringify.
  return JSON.parse(JSON.stringify(value));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOldValue(model: string, where: any): Promise<any | null> {
  if (!where) return null;
  try {
    const raw = getRawClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (raw as any)[model.charAt(0).toLowerCase() + model.slice(1)];
    if (!delegate?.findFirst) return null;
    // LIMITAÇÃO HONESTA: essa leitura roda fora da transação da mutação —
    // sob escrita concorrente no MESMO registro, o "valor anterior" pode
    // estar defasado por milissegundos. Aceitável pra auditoria; a
    // alternativa (ler dentro da tx) não é acessível de dentro de uma
    // Client Extension hoje.
    return await delegate.findFirst({ where });
  } catch {
    return null;
  }
}

async function writeAuditLog(entry: {
  action: AuditAction;
  model: string;
  recordId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  oldValue: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newValue: any;
}): Promise<void> {
  const ctx = getTenantContext();
  try {
    await getRawClient().auditLog.create({
      data: {
        tenantId: ctx?.tenantId ?? null,
        membershipId: ctx?.membershipId ?? null,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        action: entry.action,
        model: entry.model,
        recordId: entry.recordId,
        oldValue: toJsonSafe(entry.oldValue),
        newValue: toJsonSafe(entry.newValue),
      },
    });
  } catch (err) {
    // DECISÃO DELIBERADA: falha no audit NÃO derruba a operação principal —
    // perder o lançamento de uma nota porque a tabela de audit engasgou é
    // pior que perder uma linha de audit. O erro fica no log da função pra
    // ser visto no painel da Vercel.
    // eslint-disable-next-line no-console
    console.error("[audit] falha ao gravar AuditLog:", err);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeBatchData(data: any): any {
  if (!Array.isArray(data)) return toJsonSafe(data);
  return {
    count: data.length,
    sample: toJsonSafe(data.slice(0, MAX_BATCH_SAMPLE)),
    truncated: data.length > MAX_BATCH_SAMPLE,
  };
}

// ---------------------------------------------------------------------------
// Montagem do client estendido
// ---------------------------------------------------------------------------

function createExtendedClient() {
  const base = new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  return base
    .$extends({
      name: "tenant-scoping",
      query: {
        $allModels: {
          async findMany({ model, args, query }) {
            return query(injectTenantFilter(model, args));
          },
          async findFirst({ model, args, query }) {
            return query(injectTenantFilter(model, args));
          },
          async updateMany({ model, args, query }) {
            return query(injectTenantFilter(model, args));
          },
          async deleteMany({ model, args, query }) {
            return query(injectTenantFilter(model, args));
          },
          async count({ model, args, query }) {
            return query(injectTenantFilter(model, args));
          },
        },
      },
    })
    .$extends({
      name: "audit-log",
      query: {
        $allModels: {
          async create({ model, args, query }) {
            const result = await query(args);
            if (AUDITED_MODELS.has(model)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const record = result as any;
              await writeAuditLog({
                action: "CREATE",
                model,
                recordId: record?.id ?? null,
                oldValue: null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                newValue: (args as any)?.data ?? null,
              });
            }
            return result;
          },

          async update({ model, args, query }) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const a = args as any;
            const oldValue = AUDITED_MODELS.has(model) ? await fetchOldValue(model, a?.where) : null;
            const result = await query(args);
            if (AUDITED_MODELS.has(model)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const record = result as any;
              await writeAuditLog({
                action: "UPDATE",
                model,
                recordId: record?.id ?? oldValue?.id ?? null,
                oldValue,
                newValue: a?.data ?? null,
              });
            }
            return result;
          },

          async upsert({ model, args, query }) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const a = args as any;
            const oldValue = AUDITED_MODELS.has(model) ? await fetchOldValue(model, a?.where) : null;
            const result = await query(args);
            if (AUDITED_MODELS.has(model)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const record = result as any;
              await writeAuditLog({
                action: oldValue ? "UPDATE" : "CREATE",
                model,
                recordId: record?.id ?? null,
                oldValue,
                newValue: oldValue ? a?.update ?? null : a?.create ?? null,
              });
            }
            return result;
          },

          async delete({ model, args, query }) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const a = args as any;
            const oldValue = AUDITED_MODELS.has(model) ? await fetchOldValue(model, a?.where) : null;
            const result = await query(args);
            if (AUDITED_MODELS.has(model)) {
              await writeAuditLog({
                action: "DELETE",
                model,
                recordId: oldValue?.id ?? null,
                oldValue,
                newValue: null,
              });
            }
            return result;
          },

          async createMany({ model, args, query }) {
            const result = await query(args);
            if (AUDITED_MODELS.has(model)) {
              await writeAuditLog({
                action: "BATCH_CREATE",
                model,
                recordId: null,
                oldValue: null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                newValue: summarizeBatchData((args as any)?.data),
              });
            }
            return result;
          },

          async updateMany({ model, args, query }) {
            const result = await query(args);
            if (AUDITED_MODELS.has(model)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const a = args as any;
              await writeAuditLog({
                action: "BATCH_UPDATE",
                model,
                recordId: null,
                oldValue: null,
                newValue: { where: toJsonSafe(a?.where), data: toJsonSafe(a?.data) },
              });
            }
            return result;
          },

          async deleteMany({ model, args, query }) {
            const result = await query(args);
            if (AUDITED_MODELS.has(model)) {
              await writeAuditLog({
                action: "BATCH_DELETE",
                model,
                recordId: null,
                oldValue: null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                newValue: { where: toJsonSafe((args as any)?.where) },
              });
            }
            return result;
          },
        },
      },
    });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createExtendedClient>;
};

export const prisma = globalForPrisma.prisma ?? createExtendedClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
