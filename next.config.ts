import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Headers de segurança pra TODA resposta (páginas e API). CSP completo com
 * nonce fica de fora de propósito — os scripts inline de bootstrap do Next
 * exigiriam nonce por request e é fácil quebrar a app inteira; o
 * `frame-ancestors 'none'` cobre o risco concreto (clickjacking) sem esse
 * custo.
 */
const securityHeaders = [
  // 2 anos, com subdomínios — a app só roda atrás de HTTPS (Vercel).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // X-Frame-Options pra navegadores antigos; frame-ancestors é o equivalente moderno.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // Upload de source map fica desligado de propósito: exigiria
  // SENTRY_AUTH_TOKEN/org/project configurados, e sem isso o build não pode
  // falhar pra quem ainda não configurou Sentry. Sentry.init() com DSN vazio
  // já é no-op (ver src/instrumentation*.ts) — o gate de verdade é lá.
  sourcemaps: { disable: true },
  disableLogger: true,
});
