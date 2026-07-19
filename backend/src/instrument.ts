// Must be imported before any other module (server.ts does this first) so
// Sentry's instrumentation wraps express/http/prisma before they're required.
// Without SENTRY_DSN set, this is a no-op - the rest of the app never checks
// a separate "enabled" flag, it just calls Sentry.captureException et al.,
// which silently do nothing when the SDK was never initialized.
import * as Sentry from "@sentry/node";
import { env } from "./lib/env";

if (env.sentryDsn) {
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    // Light performance tracing, not the point of adding Sentry here - errors
    // are. Kept low to stay comfortably inside the free plan's event quota.
    tracesSampleRate: env.nodeEnv === "production" ? 0.1 : 0,
  });
}
