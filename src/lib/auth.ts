import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import type { MembershipRole } from "@/types/auth";

/**
 * Login único + seletor de workspace (Notion/Slack-style).
 *
 * - O login (Credentials ou Google) autentica o `User` global — sem tenant envolvido.
 * - `activeTenantId` é o workspace escolhido no seletor pós-login (ver
 *   `components/auth/WorkspaceSwitcher.tsx`), guardado como claim no JWT.
 * - A cada refresh do token, o callback `jwt` resolve a `Membership` para
 *   (userId, activeTenantId) e injeta `membershipId` + `role` no token — essa é
 *   a fonte da verdade sobre "o que esse usuário pode fazer neste workspace".
 * - `getCurrentUser()` no fim do arquivo expõe o mesmo shape que o resto do
 *   app já consome (`{ id, tenantId, role }`, onde `id` é o `Membership.id`) —
 *   as rotas escritas contra o stub anterior não precisam mudar.
 */

/**
 * Auditoria de tentativa de login (sucesso ou falha) — gap documentado desde
 * o hardening original ("eventos de login/falha não são auditados").
 * Rota pública, sem tenant/membership: fica só o e-mail em `newValue` (nunca
 * a senha) + IP no campo próprio de `AuditLog`. Best-effort: uma falha ao
 * gravar a auditoria nunca deve travar (nem derrubar) o login em si.
 */
async function logLoginAttempt(params: { success: boolean; userId?: string; email: string; ip: string }): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        action: params.success ? "LOGIN_SUCCESS" : "LOGIN_FAILURE",
        model: "User",
        recordId: params.userId ?? null,
        ip: params.ip,
        newValue: { email: params.email },
      },
    })
    .catch((err) => {
      console.error("[auth] falha ao registrar auditoria de login:", err);
    });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Google,
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      authorize: async (credentials, request) => {
        const email = typeof credentials?.email === "string" ? credentials.email : undefined;
        const password =
          typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password) return null;

        const ip = clientIpFromHeaders(request.headers);

        // Freio anti brute force / credential stuffing, persistido em banco
        // (ver lib/rate-limit.ts). Quando estoura, devolve `null` — a MESMA
        // resposta de credencial errada, de propósito: um atacante não pode
        // distinguir "senha errada" de "bloqueado", nem usar o bloqueio como
        // oráculo de quais e-mails existem.
        const [ipAllowed, emailAllowed] = await Promise.all([
          consumeRateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000),
          consumeRateLimit(`login:email:${email.trim().toLowerCase()}`, 10, 15 * 60 * 1000),
        ]);
        if (!ipAllowed || !emailAllowed) {
          await logLoginAttempt({ success: false, email, ip });
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) {
          await logLoginAttempt({ success: false, email, ip }); // conta só-Google, sem senha local
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await logLoginAttempt({ success: false, userId: user.id, email, ip });
          return null;
        }

        await logLoginAttempt({ success: true, userId: user.id, email, ip });
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id;
      }

      // Disparado pelo client via `update({ activeTenantId })` — ver WorkspaceSwitcher.
      if (trigger === "update" && session && "activeTenantId" in session) {
        token.activeTenantId = (session as { activeTenantId: string | null }).activeTenantId;
      }

      // Sempre que houver (userId, activeTenantId), resolve a Membership de novo —
      // garante que uma role revogada/alterada não fique "presa" no token antigo.
      if (token.userId && token.activeTenantId) {
        const membership = await prisma.membership.findUnique({
          where: {
            userId_tenantId: {
              userId: token.userId,
              tenantId: token.activeTenantId,
            },
          },
        });
        token.membershipId = membership && membership.active ? membership.id : null;
        token.role = membership && membership.active ? (membership.role as MembershipRole) : null;
      } else {
        token.membershipId = null;
        token.role = null;
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id = token.userId ?? "";
      session.activeTenantId = token.activeTenantId ?? null;
      session.membershipId = token.membershipId ?? null;
      session.role = token.role ?? null;
      return session;
    },
  },
});

// ---------------------------------------------------------------------------
// Ponte com o resto do app: mesma interface que o stub anterior expunha.
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string; // Membership.id do workspace ativo
  tenantId: string;
  role: MembershipRole;
}

/** Retorna null se não houver sessão OU se nenhum workspace estiver selecionado ainda. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.membershipId || !session.activeTenantId || !session.role) {
    return null;
  }
  return {
    id: session.membershipId,
    tenantId: session.activeTenantId,
    role: session.role,
  };
}

/** Lista os workspaces (Memberships) do usuário logado — usado no seletor. */
export async function listMyWorkspaces() {
  const session = await auth();
  if (!session?.user?.id) return [];

  return prisma.membership.findMany({
    where: { userId: session.user.id, active: true },
    include: { tenant: { include: { organization: { select: { id: true, name: true } } } } },
    orderBy: { tenant: { name: "asc" } },
  });
}
