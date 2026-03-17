const CACHE_NAME = "cluj-tour-v11";
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./styles/main.css",
  "./src/app.js",
  "./src/geo.js",
  "./src/storage.js",
  "./src/ui.js",
  "./data/config.json",
  "./data/stops.json",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/stops/01-avram-iancu-universitatii.svg",
  "./assets/stops/02-zidul-cetatii-potaissa.svg",
  "./assets/stops/03-strada-universitatii.svg",
  "./assets/stops/04-piata-unirii.svg",
  "./assets/stops/05-strada-iuliu-maniu.svg",
  "./assets/stops/06-piata-muzeului.svg",
  "./assets/stops/07-parcul-caragiale.svg",
  "./assets/stops/08-palatul-telefoanelor.svg",
  "./assets/stops/09-horea-mihai-viteazu-palate.svg",
  "./assets/stops/10-turnul-pompierilor.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return networkResponse;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
