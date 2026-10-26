/* Service worker : jeu jouable hors ligne. Changer VERSION à chaque mise à jour. */
const VERSION = 'necro-v33';
const FILES = ['./', './index.html', './manifest.webmanifest', './js/ks-studio.js', './js/ks-back.js', './js/lang.js', './js/data.js', './js/assets.js', './js/game.js', './icons/icon-192.png', './icons/icon-512.png', './fonts/Creepster-Regular.ttf', './fonts/Fredoka.ttf', './assets/studio_logo.webp', './assets/music_crypt.mp3', './assets/music_atelier.mp3', './assets/music_titan.mp3'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
