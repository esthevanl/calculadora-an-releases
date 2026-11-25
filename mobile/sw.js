// Guarda só a "casca" do app (telas, estilos, ícones) para abrir rápido e funcionar como app instalado.
// NUNCA guarda dados do escritório: tudo que vem do servidor (Supabase) passa direto, sem cópia no aparelho.
// A versão abaixo é trocada pelo script de publicação: mudou a versão, o celular baixa a casca nova sozinho.
const VERSION = 'an-mobile-bb40ec6b5547';
const SHELL = ['./', './index.html', './css/app.css', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // servidor do escritório: sempre direto
  // Rede primeiro (pega a versão nova); sem internet, usa a casca guardada.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))));
});

// Aviso que chega do servidor (função notify): mostra a notificação; tocar abre o app na tela certa.
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'AN Software', { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png', tag: d.tag || undefined, data: { url: d.url || '#/hoje' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(`./${e.notification.data?.url || ''}`, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const win of wins) { if ('focus' in win) { win.navigate(target).catch(() => {}); return win.focus(); } }
    return self.clients.openWindow(target);
  }));
});
