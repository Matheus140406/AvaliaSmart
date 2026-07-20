import * as Sentry from "@sentry/nextjs";

/**
 * Observabilidade de erro server-side (Node + Edge). No-op sem SENTRY_DSN
 * configurado — não é obrigatório pra rodar a app, só pra ter visibilidade
 * de erro em produção. Upload de source map fica de fora de propósito (ver
 * next.config.ts): exigiria SENTRY_AUTH_TOKEN, e sem ele o build falharia
 * silenciosamente pra quem não configurou Sentry ainda.
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0,
  // Erro real (não HttpError de negócio) é capturado explicitamente nos
  // dois funis de erro — with-tenant.ts e error-handler.ts — não aqui, pra
  // não duplicar HttpErrors esperados (403, 404 etc.) como "incidente".
});

export const onRequestError = Sentry.captureRequestError;
