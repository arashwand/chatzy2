// service-worker.js

const CACHE_NAME = 'image-lightbox-cache-v1';
const API_ENDPOINT_PATTERN = '/api/chat/downloadFileById';

// =========================
// INSTALL
// =========================
self.addEventListener('install', event => {
    console.log('[SW] Installed');
    self.skipWaiting();
});

// =========================
// ACTIVATE
// =========================
self.addEventListener('activate', event => {
    console.log('[SW] Activated');

    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME && key.startsWith('image-lightbox-cache')) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );

    self.clients.claim();
});

// =========================
// FETCH (Cache Images)
// =========================
self.addEventListener('fetch', event => {
    if (event.request.method === 'GET' &&
        event.request.url.includes(API_ENDPOINT_PATTERN)) {

        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(response => {

                    if (response) return response;

                    return fetch(event.request).then(networkResponse => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
    }
});

// =========================
// PUSH NOTIFICATION
// =========================
self.addEventListener('push', event => {
    console.log('[SW] Push Received');

    let data = {};
    try {
        data = event.data.json();
    } catch {
        data = { body: event.data.text() };
    }

    const title = data.title || "پیام جدید";
    const options = {
        body: data.body,
        icon: '/chatzy/assets/images/LOGO-118x118.png',
        badge: '/chatzy/assets/images/72.png',
        data: {
            url: data.url || "/"
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// =========================
// CLICK HANDLER
// =========================
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data.url || "/home/index";

    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true })
            .then(clientList => {
                for (const client of clientList) {
                    if (client.url.includes(url)) {
                        return client.focus();
                    }
                }
                return clients.openWindow(url);
            })
    );
});
