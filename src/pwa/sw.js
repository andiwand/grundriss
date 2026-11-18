// The service worker of the app. The build fills in VERSION and PRECACHE (vite.config.ts). It
// keeps the app in the cache, so that the app starts without the internet and installs as an app.
//
// - The page: from the network first, so that an update comes at once. Offline, from the cache.
// - The files of the build: from the cache first. Their names contain a hash, so they never change.
// - Other files of the app (models, the recognition): from the cache, and the network updates them.
// - Other servers (the climate, the map tiles, Poly Haven): never in this cache.
// - The API of a Grundriss server (`api/` below the scope): never in this cache.

const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `grundriss-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

// The cache of the version before stays until the next update: a page of the old version that is
// still open loads its files (for example the tracing) with the names of its build.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const old = keys.filter((key) => key.startsWith("grundriss-") && key !== CACHE);
        return Promise.all(old.slice(0, -1).map((key) => caches.delete(key)));
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  // The API of a Grundriss server under the same path: always from the network.
  if (url.pathname.startsWith(`${scope.pathname}api/`)) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith(`${scope.pathname}assets/`)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put("./", response.clone());
    return response;
  } catch (error) {
    const page = (await cache.match(request)) ?? (await cache.match("./"));
    if (page) return page;
    throw error;
  }
}

/** A file of the cache of this version, or of the version before, which it then takes over. */
async function cached(cache, request) {
  const own = await cache.match(request);
  if (own) return own;
  const old = await caches.match(request);
  if (old) await cache.put(request, old.clone());
  return old;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const found = await cached(cache, request);
  if (found) return found;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE);
  const found = await cached(cache, request);
  const update = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  if (found) {
    event.waitUntil(update.catch(() => undefined));
    return found;
  }
  return update;
}
