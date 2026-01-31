// service-worker.js

const CACHE_NAME = 'image-lightbox-cache-v1';

// *** تغییر کلیدی: این الگو را با API واقعی شما مطابقت دادیم ***
const API_ENDPOINT_PATTERN = '/api/chat/downloadFileById';

// رویداد 'install'
self.addEventListener('install', event => {
    //console.log('Service Worker: در حال نصب...');
    // این دستور باعث می‌شود Service Worker جدید منتظر نماند و سریع‌تر فعال شود.
    self.skipWaiting();
});

// رویداد 'activate' برای پاک‌سازی کش‌های قدیمی
self.addEventListener('activate', event => {
    //console.log('Service Worker: فعال شد.');
    event.waitUntil(
        caches.keys().then(keyList => {
            return Promise.all(
                keyList.map(key => {
                    if (key !== CACHE_NAME && key.startsWith('image-lightbox-cache')) {
                        //console.log('Service Worker: در حال حذف کش قدیمی:', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// رویداد 'fetch' برای رهگیری درخواست‌ها
self.addEventListener('fetch', event => {

    //console.log('SW saw a fetch for:', event.request.url);

    // فقط درخواست‌های GET به API تصاویر را رهگیری می‌کنیم.
    if (event.request.method === 'GET' && event.request.url.includes(API_ENDPOINT_PATTERN)) {
        //console.log('Service Worker: درخواست رهگیری شد:', event.request.url);

        // استراتژی "Cache First, then Network"
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(response => {
                    // اگر پاسخ در کش موجود بود، آن را برگردان.
                    if (response) {
                        //console.log('Service Worker: پاسخ از کش بازگردانده شد.');
                        return response;
                    }

                    // اگر در کش نبود، درخواست را به شبکه ارسال کن.
                    //console.log('Service Worker: پاسخ در کش نبود، ارسال درخواست به شبکه...');
                    return fetch(event.request).then(networkResponse => {
                        // یک کپی از پاسخ را در کش ذخیره کن.
                       //console.log('Service Worker: پاسخ از شبکه دریافت و در کش ذخیره شد.');
                        cache.put(event.request, networkResponse.clone());

                        // پاسخ اصلی را به صفحه برگردان.
                        return networkResponse;
                    });
                });
            })
        );
    }
});