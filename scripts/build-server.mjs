// Bundles the server (server/src/main.ts) with the model code that it uses into one file,
// server/dist/main.mjs, which runs with Node and needs no package. The version comes from
// package.json.

import { build } from "esbuild";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

await build({
  entryPoints: ["server/src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "server/dist/main.mjs",
  define: { __VERSION__: JSON.stringify(version) },
  logLevel: "warning",
});
console.log(`Built server/dist/main.mjs, version ${version}.`);
