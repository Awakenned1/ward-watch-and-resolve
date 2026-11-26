// Ward Resolve service worker: makes the site installable as an app and shows an offline page.
// Privacy: pages, server functions and Supabase data are never cached, because they can contain
// residents' personal details. Only public, fingerprinted build files and app icons are stored.
// Bump VERSION when PRECACHE changes so old caches are removed.
const VERSION = "v1";
const CACHE = `ward-resolve-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];
const MAX_ASSET_ENTRIES = 200;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("ward-resolve-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Keeps the cache bounded as each deployment adds newly fingerprinted files.
async function trimCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_ASSET_ENTRIES - PRECACHE.length;
  for (const request of keys) {
    if (excess <= 0) break;
    if (new URL(request.url).pathname.startsWith("/assets/")) {
      await cache.delete(request);
      return trimCache(cache);
    }
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
    trimCache(cache);
  }
  return response;
}

async function networkWithOfflinePage(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match(OFFLINE_URL)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Supabase, map tiles and fonts go straight to the network with the browser's own caching.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkWithOfflinePage(request));
    return;
  }

  // Build output under /assets/ is content-hashed, so a cached copy never goes stale.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  }
});
