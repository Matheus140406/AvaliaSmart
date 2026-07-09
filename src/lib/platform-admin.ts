/**
 * Módulo financeiro (Etapa 7) é uma visão CROSS-TENANT (status de
 * assinatura de TODOS os tenants) — não é uma feature de tenant, é
 * operacional (só quem administra o próprio AvaliaSmart deveria ver). Não
 * existe ainda um conceito de "platform admin" no app (toda role hoje é
 * escopada a UM Tenant via Membership) — em vez de inventar um novo
 * model/migração só pra isso, reaproveita o mesmo padrão de gate por env
 * var já usado por `CRON_SECRET`: uma lista de e-mails autorizados,
 * configurada fora do banco. Sem a env var configurada, ninguém acessa
 * (default seguro).
 */
export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
