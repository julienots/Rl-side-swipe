// Service worker : mise en cache pour jouer hors ligne (stratégie « réseau d'abord, cache en secours »).
const CACHE = 'bolidball-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './src/main.js', './src/ui/ui.js', './src/ui/style.css',
  './src/core/math.js', './src/core/constants.js', './src/core/arena.js', './src/core/physics.js', './src/core/car.js',
  './src/core/world.js', './src/core/predict.js', './src/core/ai.js', './src/core/match.js', './src/core/challenge.js', './src/core/stepper.js',
  './src/game/renderer.js', './src/game/carArt.js', './src/game/themes.js', './src/game/particles.js', './src/game/camera.js',
  './src/game/input.js', './src/game/audio.js',
  './src/meta/save.js', './src/meta/cosmetics.js', './src/meta/progression.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
