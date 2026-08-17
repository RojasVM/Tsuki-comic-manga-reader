const VERSION = "tsuki-v4";
const SHELL = `${VERSION}-shell`;
const FILES = `${VERSION}-files`;

const SHELL_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "vendor/jszip.min.js",
  "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isContent = url.pathname.includes("/content/");

  // capitulos .cbz y portadas: cache-first (relectura offline)
  if (isContent && /\.(cbz|webp|png|jpe?g|avif)$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(FILES).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // manifests json: network-first (para ver capitulos nuevos)
  if (isContent && url.pathname.endsWith(".json")) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(FILES).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // shell: cache-first
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
