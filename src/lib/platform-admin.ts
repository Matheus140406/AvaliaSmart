import { prisma } from "@/lib/prisma";

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

/**
 * Variante que os gates cross-tenant DEVEM usar: além do allowlist, exige
 * que a conta tenha o e-mail VERIFICADO (`User.emailVerified`) — só o login
 * via Google (PrismaAdapter) seta esse campo hoje; cadastro por senha não.
 *
 * Sem essa checagem, o allowlist tinha um buraco real: o cadastro
 * (/api/auth/register) não verifica posse do e-mail, então qualquer pessoa
 * que soubesse um e-mail listado em PLATFORM_ADMIN_EMAILS podia registrá-lo
 * antes do dono (com a própria senha) e herdar a visão financeira
 * cross-tenant. Register também bloqueia e-mails do allowlist na origem —
 * as duas camadas juntas fecham o buraco. Na prática: platform admin entra
 * com Google, sempre.
 */
export async function isVerifiedPlatformAdmin(email: string | null | undefined): Promise<boolean> {
  if (!isPlatformAdmin(email)) return false;
  const user = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { emailVerified: true },
  });
  return user?.emailVerified != null;
}
