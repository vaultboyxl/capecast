// CapeCast service worker: cache-first shell, network-first data with offline fallback
// (so the last forecast still shows in the lineup with no signal).
const SHELL = "capecast-shell-v14";
const DATA = "capecast-data-v1";
const SHELL_FILES = ["./", "./index.html", "./style.css?v=14", "./app.js?v=14", "./zones.js?v=14", "./icon.svg", "./icon-192.png", "./manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => ![SHELL, DATA].includes(k)).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // buoys.json is live data on our own origin — must be network-first, never shell-cached
  if (url.origin === location.origin && !url.pathname.endsWith("buoys.json")) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
  } else {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(DATA).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
  }
});
