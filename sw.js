// Service worker mínimo: solo existe para que Chrome considere la app
// instalable. Cachea el "shell" de la app para que abra más rápido y
// no se rompa por completo sin internet (los datos siguen viniendo de
// Firebase, así que sin conexión no vas a poder leer/guardar).
const CACHE = 'mis-finanzas-v1';
const ARCHIVOS = ['./', './index.html', './app.js', './firebase-config.js', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Red primero; si falla (sin internet), intenta servir del cache.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
