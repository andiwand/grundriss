// The project loads no Node types (see "types" in tsconfig.json). The OpenCV test needs only
// `createRequire`, so this file declares it.

declare module "node:module" {
  export function createRequire(url: string): (id: string) => unknown;
}
