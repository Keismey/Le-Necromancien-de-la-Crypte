/* Service worker : jeu jouable hors ligne. Changer VERSION à chaque mise à jour. */
const VERSION = 'necro-v39';
const FILES = ['./', './index.html', './manifest.webmanifest', './js/ks-studio.js', './js/ks-back.js', './js/lang.js', './js/data.js', './js/assets.js', './js/game.js', './icons/icon-192.png', './icons/icon-512.png', './fonts/Creepster-Regular.woff2', './fonts/Fredoka.woff2', './assets/studio_logo.webp', './assets/music_crypt.mp3', './assets/music_atelier.mp3', './assets/music_titan.mp3'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('necro-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // réseau d'abord ; on ne garde que les réponses complètes (ni page d'erreur, ni morceau de musique en 206)
  e.respondWith(fetch(e.request).then(r => {
    if (r.status === 200) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }
    if (r.status >= 500) return caches.match(e.request).then(c => c || r); // serveur en panne : la copie hors ligne
    return r;
  }).catch(() => caches.match(e.request)));
});
