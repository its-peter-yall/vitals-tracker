const prefix = "vitals-tracker-static-";
const version = `${prefix}v2`;
const installAssets = new Set([
  "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png",
  "/icons/maskable-512.png", "/icons/apple-touch-icon.png",
]);

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(prefix) && key !== version)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || request.mode === "navigate" || request.headers.has("Range") ||
      url.origin !== self.location.origin || url.search ||
      (!installAssets.has(url.pathname) && !url.pathname.startsWith("/_next/static/"))) return;

  event.respondWith((async () => {
    const cache = await caches.open(version).catch(() => undefined);
    const existing = await cache?.match(request).catch(() => undefined);
    if (existing) return existing;
    const response = await fetch(request);
    if (cache && response.ok && !response.redirected &&
        !/\bno-store\b/i.test(response.headers.get("Cache-Control") ?? "")) {
      await cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  })());
});
