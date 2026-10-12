// Service worker : fonctionnement hors connexion.
// Réponse immédiate depuis le cache, puis mise à jour du cache en arrière-plan
// (la nouvelle version de l'outil est utilisée au chargement suivant).
// Aucune donnée d'athlète n'est mise en cache ici : elles restent dans IndexedDB.
var VERSION = 'respir-outdoor-v3';
var FICHIERS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FICHIERS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    // Ne supprime que les anciens caches de cette application : d'autres applications du même site
    // (sylvainmorera.github.io) partagent le même espace de caches.
    return Promise.all(cles.filter(function (k) { return k.indexOf('respir-outdoor-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(e.request, { ignoreSearch: true }).then(function (enCache) {
      var reseau = fetch(e.request).then(function (rep) {
        if (rep && rep.ok) cache.put(e.request, rep.clone());
        return rep;
      }).catch(function () { return enCache; });
      return enCache || reseau;
    });
  }));
});
