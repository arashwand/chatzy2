// نام پایگاه داده
const DB_NAME = 'ChatzyDB';
// نسخه پایگاه داده
const DB_VERSION = 1;
// پیشوند نام آبجکت استورها
const CHAT_STORE_PREFIX = 'chat_';

/**
 * یک نمونه از پایگاه داده را باز می‌کند یا ایجاد می‌کند
 * @returns {Promise<IDBDatabase>} یک پرامیس که با نمونه‌ای از پایگاه داده حل می‌شود
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            // این رویداد برای ایجاد اولیه یا تغییر ساختار آبجکت استورها استفاده می‌شود
            // اما ما آبجکت استورها را به صورت داینامیک ایجاد می‌کنیم، بنابراین اینجا خالی می‌ماند
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            console.error('خطا در باز کردن پایگاه داده:', event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * اطمینان حاصل می‌کند که آبجکت استور برای یک چت خاص وجود دارد
 * @param {IDBDatabase} db - نمونه پایگاه داده
 * @param {string} groupType - نوع گروه ('ClassGroup' یا 'ChannelGroup')
 * @param {string} roomId - شناسه چت‌روم
 * @returns {Promise<IDBDatabase>} یک پرامیس که با نمونه به‌روز شده پایگاه داده حل می‌شود
 */
function ensureChatObjectStore(db, groupType, roomId) {
    return new Promise((resolve, reject) => {
        const storeName = `${CHAT_STORE_PREFIX}${groupType}_${roomId}`;
        if (!db.objectStoreNames.contains(storeName)) {
            const currentVersion = db.version;
            db.close();

            const upgradeRequest = indexedDB.open(DB_NAME, currentVersion + 1);

            upgradeRequest.onupgradeneeded = (event) => {
                const upgradedDb = event.target.result;
                const objectStore = upgradedDb.createObjectStore(storeName, { keyPath: 'id' });
                objectStore.createIndex('timestamp', 'timestamp', { unique: false });
            };

            upgradeRequest.onsuccess = (event) => {
                const newDb = event.target.result;
                resolve(newDb); // بازگرداندن نمونه جدید پایگاه داده
            };

            upgradeRequest.onerror = (event) => {
                console.error('خطا در ارتقاء پایگاه داده:', event.target.error);
                reject(event.target.error);
            };
        } else {
            resolve(db); // بازگرداندن نمونه فعلی اگر آبجکت استور وجود داشت
        }
    });
}

/**
 * پیام‌ها را در آبجکت استور مربوط به یک چت ذخیره می‌کند
 * @param {string} groupType - نوع گروه
 * @param {string} roomId - شناسه چت‌روم
 * @param {Array<object>} messages - آرایه‌ای از آبجکت‌های پیام
 * @returns {Promise<void>}
 */
async function saveMessages(groupType, roomId, messages) {
    let db = await openDB();
    db = await ensureChatObjectStore(db, groupType, roomId);

    const storeName = `${CHAT_STORE_PREFIX}${groupType}_${roomId}`;
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    messages.forEach(message => {
        store.put(message);
    });

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            db.close();
            resolve();
        };
        transaction.onerror = (event) => {
            db.close();
            console.error('خطا در ذخیره پیام‌ها:', event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * پیام‌های یک چت را از پایگاه داده محلی بازیابی می‌کند
 * @param {string} groupType - نوع گروه
 * @param {string} roomId - شناسه چت‌روم
 * @param {number} [count=50] - تعداد پیام‌ها
 * @returns {Promise<Array<object>>}
 */
async function getMessages(groupType, roomId, count = 50) {
    const db = await openDB();
    const storeName = `${CHAT_STORE_PREFIX}${groupType}_${roomId}`;

    if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        return [];
    }

    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index('timestamp');
    const messages = [];
    const request = index.openCursor(null, 'prev');

    return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor && messages.length < count) {
                messages.push(cursor.value);
                cursor.continue();
            } else {
                db.close();
                resolve(messages.reverse());
            }
        };
        request.onerror = (event) => {
            db.close();
            reject(event.target.error);
        };
    });
}

/**
 * یک پیام خاص را از آبجکت استور حذف می‌کند
 * @param {string} groupType - نوع گروه
 * @param {string} roomId - شناسه چت‌روم
 * @param {string} messageId - شناسه پیام
 * @returns {Promise<void>}
 */
async function deleteMessage(groupType, roomId, messageId) {
    const db = await openDB();
    const storeName = `${CHAT_STORE_PREFIX}${groupType}_${roomId}`;

    if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        return;
    }

    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    store.delete(messageId);

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            db.close();
            resolve();
        };
        transaction.onerror = (event) => {
            db.close();
            reject(event.target.error);
        };
    });
}
