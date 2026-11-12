// Service worker do RL Advocacia: só recebe e mostra os alertas de meta.
// (Não guarda páginas em cache: o sistema continua sempre atualizado.)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'Vai, vencedor(a)!';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || 'Bora pra meta!',
    icon: '/icone-192.png',
    badge: '/icone-192.png',
    tag: d.tag || 'meta',
    renotify: true,
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of lista) {
      if ('focus' in c) { c.navigate(url); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
