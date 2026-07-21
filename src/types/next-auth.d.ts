import type { MembershipRole } from "./auth";

/**
 * Aumenta os tipos de sessão/JWT com os campos custom que carregam o
 * "workspace ativo" — preenchidos pelos callbacks jwt/session em `lib/auth.ts`.
 *
 * IMPORTANTE: no next-auth@5 (beta), `Session` e `JWT` são declarados em
 * "@auth/core/types" e "@auth/core/jwt" — o pacote "next-auth" só faz
 * `export type {...}` (re-export), o que NÃO participa de declaration
 * merging. Por isso a augmentation tem que mirar "@auth/core/*", não
 * "next-auth"/"next-auth/jwt" (que é o que a maioria dos exemplos antigos
 * de NextAuth v4 mostra, e não funciona mais aqui).
 */
declare module "@auth/core/types" {
  interface Session {
    activeTenantId: string | null;
    membershipId: string | null; // Membership.id do workspace ativo — vira SessionUser.id
    role: MembershipRole | null;
    // true logo após um login OAuth (Google) numa conta com MFA ativado — o
    // `authorize()` do Credentials já valida o segundo fator inline, mas o
    // fluxo OAuth não passa por ali, então precisa desse claim + gate
    // separado em proxy.ts (ver comentário em lib/auth.ts).
    mfaPending: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
    activeTenantId?: string | null;
    membershipId?: string | null;
    role?: MembershipRole | null;
    mfaPending?: boolean;
  }
}
