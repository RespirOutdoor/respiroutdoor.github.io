// Service worker : fonctionnement hors connexion de Respir Outdoor Coach.
// Fichiers de l'application : réponse immédiate depuis le cache, mise à jour en arrière-plan
// (la nouvelle version est utilisée au chargement suivant). config.json : réseau d'abord.
// Aucune donnée d'athlète n'est mise en cache ici : elles restent dans IndexedDB et le tableur de l'entraîneur.
var PREFIXE = 'respir-outdoor-';
var VERSION = PREFIXE + 'v8';
var FICHIERS = ['./', './index.html', './manifest.json', './config.json', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FICHIERS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  // Ne supprime que les anciens caches de cette application : d'autres applications du même site partagent l'espace des caches.
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k.indexOf(PREFIXE) === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  var config = /\/config\.json$/.test(new URL(e.request.url).pathname);
  e.respondWith(caches.open(VERSION).then(function (cache) {
    return cache.match(e.request, { ignoreSearch: true }).then(function (enCache) {
      var reseau = fetch(e.request).then(function (rep) {
        if (rep && rep.ok) cache.put(e.request, rep.clone());
        return rep;
      }).catch(function () { return enCache; });
      return config ? reseau.then(function (r) { return r || enCache; }) : (enCache || reseau);
    });
  }));
});
