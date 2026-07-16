import app from "./app";
import { env } from "./lib/env";
import { checkAllLinks } from "./services/linkChecker";

const LINK_CHECK_INTERVAL_MS = 6 * 60 * 60_000; // every 6 hours

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ميسوور API يعمل على المنفذ ${env.port} (${env.nodeEnv})`);
});

// Automatic government-link health checks, not just the owner's manual button.
// Runs once shortly after boot (staggered so it doesn't compete with startup
// traffic), then on a fixed interval for the life of the process.
setTimeout(() => {
  checkAllLinks().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("فشل الفحص التلقائي للروابط الحكومية:", err);
  });
  setInterval(() => {
    checkAllLinks().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("فشل الفحص التلقائي للروابط الحكومية:", err);
    });
  }, LINK_CHECK_INTERVAL_MS);
}, 30_000);
