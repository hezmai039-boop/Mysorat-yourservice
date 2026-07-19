import "./instrument";
import * as Sentry from "@sentry/node";
import app from "./app";
import { env } from "./lib/env";
import { prisma } from "./lib/prisma";
import { checkAllLinks } from "./services/linkChecker";

const LINK_CHECK_INTERVAL_MS = 6 * 60 * 60_000; // every 6 hours

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ميسوور API يعمل على المنفذ ${env.port} (${env.nodeEnv})`);
});

// Render (and any host doing rolling/zero-downtime deploys) sends SIGTERM before
// killing the process. Without handling it, requests already in flight for real
// concurrent users get cut off mid-response instead of finishing normally, and
// the Prisma connection pool is never closed cleanly. Stop accepting new
// connections, let in-flight ones finish (bounded by a timeout so a stuck
// request can't block a deploy forever), then disconnect.
function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`${signal} مستلم، إيقاف تدريجي للخادم...`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  server.close(async () => {
    clearTimeout(forceExit);
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Automatic government-link health checks, not just the owner's manual button.
// Runs once shortly after boot (staggered so it doesn't compete with startup
// traffic), then on a fixed interval for the life of the process.
setTimeout(() => {
  checkAllLinks().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("فشل الفحص التلقائي للروابط الحكومية:", err);
    Sentry.captureException(err);
  });
  setInterval(() => {
    checkAllLinks().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("فشل الفحص التلقائي للروابط الحكومية:", err);
      Sentry.captureException(err);
    });
  }, LINK_CHECK_INTERVAL_MS);
}, 30_000);
