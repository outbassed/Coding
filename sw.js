/* Coding — service worker (funciona offline).
   O app busca sempre a versão mais nova quando há internet e usa o cache só offline. */
const CACHE_VERSION = 28;
const CACHE = "coding-cache-v" + CACHE_VERSION;
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "core.js",
  "labels.js",
  "texts.js",
  "menu.js",
  "barcodes.js",
  "tools.js",
  "calc-engine.js",
  "tool-calc.js",
  "tool-images.js",
  "tool-pdf.js",
  "tool-fun.js",
  "vendor/qrcode.js",
  "vendor/pdf.min.js",
  "vendor/pdf.worker.min.js",
  "vendor/pdf-lib.min.js",
  "exemplos/praia.jpg",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("coding-cache-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Abre o app mesmo sem internet: tenta a rede e cai no cache.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("index.html", copy));
          return response;
        })
        .catch(() => caches.match("index.html").then((cached) => cached || caches.match("./")))
    );
    return;
  }

  // Demais arquivos: rede primeiro (sempre a versão mais nova); sem internet, usa o cache.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
