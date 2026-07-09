import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Regras:
 *  1. Sem sessão -> /login
 *  2. Sessão, mas sem workspace ativo (nenhuma Membership selecionada) -> /workspaces
 *  3. Sessão + workspace ativo -> segue normalmente
 *
 * `/login`, `/registrar`, `/workspaces` e as rotas de API do NextAuth ficam
 * de fora — senão criaríamos um loop de redirecionamento.
 */

// /api/billing/webhook* e /api/export/download* são públicos de propósito:
// os gateways/links compartilhados chamam de fora, sem sessão — a
// autenticação é o token/assinatura validado em cada rota (não uma
// exceção de segurança, é o MESMO padrão: token na URL substitui cookie).
const PUBLIC_PATHS = ["/login", "/registrar", "/esqueci-senha", "/redefinir-senha", "/api/auth", "/api/billing/webhook", "/api/cron", "/api/export/download"];
const WORKSPACE_SELECTOR_PATH = "/workspaces";

// Precisam de SESSÃO mas NÃO de workspace ativo — são exatamente as rotas
// que resolvem "não ter workspace ainda" (criar o primeiro, ou aceitar um
// convite pra entrar num). Comparação exata (não prefixo) de propósito: não
// queremos isentar `/api/workspaces/invites` (listar/criar convite), que
// exige tenant ativo via `withTenant`.
const WORKSPACE_SETUP_PATHS = new Set([
  "/workspaces",
  "/api/workspaces",
  "/api/workspaces/invites/accept",
  "/convite/aceitar",
]);

// Prefixo (não exato): Organization é global ao User, não a um Tenant ativo
// — igual /workspaces, mas com rotas dinâmicas (/api/organizations/[id]/tenants/[tenantId])
// que não cabem no Set de comparação exata acima. /financeiro e
// /api/platform (Etapa 7) são cross-tenant pelo mesmo motivo — a checagem
// de acesso de verdade é o gate de PLATFORM_ADMIN_EMAILS dentro da rota,
// não a sessão de workspace.
const WORKSPACE_SETUP_PREFIXES = ["/organizacoes", "/api/organizations", "/financeiro", "/api/platform"];

export default auth((request) => {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  if (isPublic) return NextResponse.next();

  const session = request.auth;

  if (!session?.user?.id) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    // pathname + search (não só pathname): o link de convite carrega
    // `?token=...` — perder isso no round-trip do login quebraria o aceite.
    loginUrl.searchParams.set("callbackUrl", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const hasActiveWorkspace = Boolean(session.membershipId && session.activeTenantId);
  const isWorkspaceSetup =
    WORKSPACE_SETUP_PATHS.has(pathname) || WORKSPACE_SETUP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!hasActiveWorkspace && !isWorkspaceSetup) {
    return NextResponse.redirect(new URL(WORKSPACE_SELECTOR_PATH, request.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  // Roda em tudo, exceto assets estáticos, a própria pasta de imagens do
  // Next, e arquivos estáticos de `public/` (logo, ícones) por extensão —
  // sem isso, um visitante ANÔNIMO na tela de login (o público inteiro
  // dela) tinha a própria logo redirecionada pra /login (307) em vez de
  // servida, porque o matcher não excluía esses arquivos por path/extensão
  // (bug real, achado ao validar a tela de login com a logo de verdade).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|avif)$).*)"],
};
