/* CHAMA LIVE service worker.
 * Cache only the static offline fallback and app icons.
 * Never cache HTML pages, authentication routes, API requests, or financial data.
 */
"use strict";

const CACHE_NAME = "chamalive-public-shell-v2";
const SAFE_ASSETS = [
  "/offline.html",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SAFE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith("chamalive-public-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API/auth/account/member routes are deliberately never intercepted or cached.
  if (/\/(auth|login|logout|member|admin|api|rest|functions)(\/|\?|$)/i.test(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match("/offline.html");
        return cached || new Response("You are offline. Reconnect and try again.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
        });
      })
    );
    return;
  }

  // Only serve explicitly listed public assets from cache; other requests go to network.
  if (SAFE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
