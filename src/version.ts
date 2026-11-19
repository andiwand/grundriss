// The version of the app from package.json. vite.config.ts defines it for the build. The tests
// run without the build, so there the version is "dev".

declare const __APP_VERSION__: string | undefined;

export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
