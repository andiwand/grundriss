// Starts the server of Grundriss. The configuration comes from the environment (see the README):
//
//   GRUNDRISS_DATA          The folder of the data. Default "./data".
//   GRUNDRISS_APP           The folder of the build of the app. Default "./app" next to this file.
//   GRUNDRISS_PUBLIC_SITE   "true": serve the website at `/`. Else `/` goes to the app.
//   GRUNDRISS_SITE          The folder of the build of the website. Default "./site" next to this.
//   GRUNDRISS_LINK_HOURS    The time of a setup, invite, or reset link, in hours. Default 72.
//   GRUNDRISS_SESSION_DAYS  The time of a login, in days. Default 30.
//   GRUNDRISS_QUOTA_MB      The space of the plans of an account, in MB. 0 is no limit. Default 500.
//   GRUNDRISS_MAX_PLANS     The number of plans of an account. 0 is no limit. Default 100.
//   GRUNDRISS_ADMIN_RESET   "true": show a link to set a new password of the admin in the log.
//   GRUNDRISS_MAX_BODY      The largest plan in MB. Default 100.
//   PORT                    The port. Default 8080.

import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHandler, type Config } from "./app";
import { DEFAULT_OPTIONS, Store } from "./store";

declare const __VERSION__: string;
const version = typeof __VERSION__ === "string" ? __VERSION__ : "dev";

const env = process.env;
const here = dirname(fileURLToPath(import.meta.url));

/** A number of the environment, or the default if it is missing or not a number. */
const number = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
};

const config: Config = {
  appDir: resolve(env.GRUNDRISS_APP ?? join(here, "app")),
  siteDir:
    env.GRUNDRISS_PUBLIC_SITE === "true" ? resolve(env.GRUNDRISS_SITE ?? join(here, "site")) : "",
  maxBody: number(env.GRUNDRISS_MAX_BODY, 100) * 1024 * 1024,
  version,
};
const port = number(env.PORT, 8080);
const store = new Store(resolve(env.GRUNDRISS_DATA ?? "data"), {
  linkHours: number(env.GRUNDRISS_LINK_HOURS, DEFAULT_OPTIONS.linkHours),
  sessionDays: number(env.GRUNDRISS_SESSION_DAYS, DEFAULT_OPTIONS.sessionDays),
  quota: number(env.GRUNDRISS_QUOTA_MB, DEFAULT_OPTIONS.quota / 1024 / 1024) * 1024 * 1024,
  maxPlans: number(env.GRUNDRISS_MAX_PLANS, DEFAULT_OPTIONS.maxPlans),
});

// While there is no admin, each start shows a new setup link. A restart with
// GRUNDRISS_ADMIN_RESET shows a link to set a new password of the admin.
const setup = store.setupLink();
const reset = !setup && env.GRUNDRISS_ADMIN_RESET === "true" ? store.adminResetLink() : null;

// Sessions and links that ended go away at the start, and then every hour.
const cleanUp = () => {
  const removed = store.removeExpired();
  if (removed > 0) console.log(`Removed ${removed} sessions and links that ended.`);
};
cleanUp();
setInterval(cleanUp, 3_600_000).unref();

// One handler for all requests, so that the streams and the people are shared.
const handler = createHandler(store, config);
const server = createServer((req, res) => void handler(req, res));
server.listen(port, () => {
  console.log(`Grundriss server ${version}, port ${port}.`);
  const show = (text: string, path: string) => {
    console.log("");
    console.log(text);
    console.log(`  ${path}`);
    console.log(`  For example: http://localhost:${port}${path}`);
    console.log(`  It works once, for ${store.options.linkHours} hours.`);
    console.log("");
  };
  if (setup)
    show(
      "Set up the admin account with this link, on the address of this server:",
      `/setup/${setup}`,
    );
  if (reset) show("Set a new password of the admin with this link:", `/reset/${reset}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    // Event streams can stay open forever. Give pending requests time, then close them too.
    setTimeout(() => server.closeAllConnections(), 5_000).unref();
  });
}
