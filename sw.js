const CACHE = 'mediremind-v19';
const ASSETS = ['./', './index.html', './styles.css', './chatbot.css', './app.js', './chatbot.js', './manifest.webmanifest', './icon.svg', './img/logo.svg', './img/bottle.svg', './img/capsules.svg', './img/tablets.svg'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).catch(()=>caches.match('./index.html'))));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window'}).then((wins) => {
    const w = wins.find((x)=>x.url.includes('index'));
    if (w) return w.focus();
    return clients.openWindow('./index.html');
  }));
});
