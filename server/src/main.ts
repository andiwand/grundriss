// Starts the server of Grundriss. The configuration comes from the environment (see the README):
//
//   GRUNDRISS_MODE         "full" (the app and the API) or "api" (only the API). Default "full".
//   GRUNDRISS_DATA         The folder of the data. Default "./data".
//   GRUNDRISS_APP          The folder of the build of the app. Default "./app" next to this file.
//   GRUNDRISS_ORIGINS      The origins that may call the API, separated by commas.
//   GRUNDRISS_APP_URL      The app that `/app` sends the browser to; in mode "api" also `/<token>/`.
//   GRUNDRISS_HOME_URL     The website that `/` sends the browser to.
//   GRUNDRISS_PUBLIC_SITE  "true": serve the website at `/` and the app at `/app/` for everybody.
//   GRUNDRISS_SITE         The folder of the build of the website. Default "./site" next to this.
//   GRUNDRISS_ROOT_TOKEN   An own root token. Without it, the server makes one at the first start.
//   GRUNDRISS_MAX_BODY     The largest plan in MB. Default 100.
//   PORT                   The port. Default 8080.

import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHandler, type Config } from "./app";
import { Store } from "./store";

declare const __VERSION__: string;
const version = typeof __VERSION__ === "string" ? __VERSION__ : "dev";

const env = process.env;
const here = dirname(fileURLToPath(import.meta.url));
const mode = env.GRUNDRISS_MODE === "api" ? "api" : "full";
const config: Config = {
  mode,
  appDir: resolve(env.GRUNDRISS_APP ?? join(here, "app")),
  origins: (env.GRUNDRISS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  appUrl: env.GRUNDRISS_APP_URL ?? "",
  homeUrl: env.GRUNDRISS_HOME_URL ?? "",
  siteDir:
    env.GRUNDRISS_PUBLIC_SITE === "true" ? resolve(env.GRUNDRISS_SITE ?? join(here, "site")) : "",
  maxBody: Number(env.GRUNDRISS_MAX_BODY ?? 100) * 1024 * 1024,
  version,
};
const port = Number(env.PORT ?? 8080);
const store = new Store(resolve(env.GRUNDRISS_DATA ?? "data"));
const created = store.ensureRoot(env.GRUNDRISS_ROOT_TOKEN || undefined);

// One handler for all requests, so that the leases and the streams are shared.
const handler = createHandler(store, config);
const server = createServer((req, res) => void handler(req, res));
server.listen(port, () => {
  console.log(`Grundriss server ${version}, mode "${mode}", port ${port}.`);
  if (created) {
    console.log("");
    console.log("The root token, shown only this time. Keep it safe:");
    console.log(`  ${created}`);
    console.log(`  http://localhost:${port}/${created}/`);
    console.log("");
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    // Event streams can stay open forever. Give pending requests time, then close them too.
    setTimeout(() => server.closeAllConnections(), 5_000).unref();
  });
}
