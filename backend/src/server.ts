import app from "./app";
import { env } from "./lib/env";

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`ميسوور API يعمل على المنفذ ${env.port} (${env.nodeEnv})`);
});
