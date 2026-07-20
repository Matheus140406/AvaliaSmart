import * as Sentry from "@sentry/nextjs";

/** Observabilidade de erro no browser. No-op sem NEXT_PUBLIC_SENTRY_DSN. */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});
