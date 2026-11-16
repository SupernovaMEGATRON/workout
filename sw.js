/* Service worker — keeps a copy of the app on the phone so it opens without a network.

   Only app files are cached here. User data lives in LocalStorage and is never touched.

   On each release: change the version in version.js, and keep FILES complete
   (tools/check_files.py verifies it). */
importScripts('version.js');

const CACHE = 'pablo-' + self.PABLO_VERSION;

const FILES = [
  './',
  'index.html',
  'version.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'css/app.css',
  'vendor/tailwind.js',
  'vendor/fonts/fonts.css',
  'vendor/fonts/spacegrotesk-latin.woff2',
  'vendor/fonts/spacegrotesk-latin-ext.woff2',
  'vendor/fonts/jetbrainsmono-latin.woff2',
  'vendor/fonts/jetbrainsmono-latin-ext.woff2',
  'js/tailwind-config.js',
  'js/app.js',
  'js/core/nav.js',
  'js/core/ui.js',
  'js/core/shell.js',
  'js/core/backup.js',
  'js/modules/home.js',
  'js/modules/workout.js',
  'js/modules/settings.js',
];

// Download the whole new version first. If any file is missing, the install fails and
// the previous version keeps running.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' }))))
  );
});

// Once this version is in charge, drop the files of older versions.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('pablo-') && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

// The page asks for this when the user taps "Update".
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Serve app files from the phone; anything else goes to the network.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});
