// نام پایگاه داده
const DB_NAME = 'ChatzyDB';
// نسخه پایگاه داده
const DB_VERSION = 2;
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
 * آخرین شناسه پیام ذخیره شده برای یک چت را بازیابی می‌کند
 * @param {string} groupType - نوع گروه
 * @param {string} roomId - شناسه چت‌روم
 * @returns {Promise<number|null>} - شناسه آخرین پیام یا null اگر پیامی یافت نشد
 */
async function getLastMessageId(groupType, roomId) {
    const db = await openDB();
    const storeName = `${CHAT_STORE_PREFIX}${groupType}_${roomId}`;

    if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        return null;
    }

    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index('timestamp');

    // از یک کرسر با جهت معکوس (prev) برای پیدا کردن آخرین آیتم استفاده می‌کنیم
    const request = index.openCursor(null, 'prev');

    return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            db.close();
            if (cursor) {
                // cursor.value.id همان شناسه پیام است
                resolve(cursor.value.id);
            } else {
                // هیچ پیامی در استور یافت نشد
                resolve(null);
            }
        };
        request.onerror = (event) => {
            db.close();
            console.error('خطا در بازیابی آخرین شناسه پیام:', event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * تمام شناسه‌های پیام را بعد از یک تاریخ مشخص بازیابی می‌کند
 * @param {string} groupType - نوع گروه
 * @param {string} roomId - شناسه چت‌روم
 * @param {string} timestamp - تاریخ به صورت ISO string
 * @returns {Promise<Array<string>>} - آرایه‌ای از شناسه‌های پیام
 */
async function getAllMessageIdsAfter(groupType, roomId, timestamp) {
    const db = await openDB();
    const storeName = `${CHAT_STORE_PREFIX}${groupType}_${roomId}`;

    if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        return [];
    }

    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index('timestamp');
    const messageIds = [];

    // یک محدوده برای تاریخ‌های جدیدتر از timestamp ایجاد می‌کنیم
    const range = IDBKeyRange.lowerBound(timestamp, true); // true یعنی خود تاریخ را شامل نشود

    const request = index.openKeyCursor(range);

    return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                messageIds.push(cursor.primaryKey);
                cursor.continue();
            } else {
                db.close();
                resolve(messageIds);
            }
        };
        request.onerror = (event) => {
            db.close();
            reject(event.target.error);
        };
    });
}

/**
 * شناسه‌های پیام‌های جدیدتر از یک تاریخ مشخص را بازیابی می‌کند
 * @param {string} groupType - نوع گروه
 * @param {string} roomId - شناسه چت‌روم
 * @param {string} timestamp - تاریخ به صورت ISO string
 * @returns {Promise<Array<string>>} - آرایه‌ای از شناسه‌های پیام
 */
async function getMessageIdsSince(groupType, roomId, timestamp) {
    const db = await openDB();
    const storeName = `${CHAT_STORE_PREFIX}${groupType}_${roomId}`;

    if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        return [];
    }

    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index('timestamp');
    const messageIds = [];

    // یک محدوده برای تاریخ‌های جدیدتر از timestamp ایجاد می‌کنیم
    const range = IDBKeyRange.lowerBound(timestamp, false); // false یعنی خود تاریخ را شامل شود

    // از openKeyCursor برای بهینه‌سازی استفاده می‌کنیم چون فقط به کلیدها نیاز داریم
    const request = index.openKeyCursor(range);

    return new Promise((resolve, reject) => {
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                // primaryKey همان شناسه پیام (id) است
                messageIds.push(cursor.primaryKey);
                cursor.continue();
            } else {
                db.close();
                resolve(messageIds);
            }
        };
        request.onerror = (event) => {
            db.close();
            console.error('خطا در بازیابی کلیدها بر اساس تاریخ:', event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * پیام‌های قدیمی‌تر از یک تاریخ مشخص را بازیابی می‌کند
 * @param {string} groupType - نوع گروه
 * @param {string} roomId - شناسه چت‌روم
 * @param {string} timestamp - تاریخ به صورت ISO string
 * @param {number} [count=50] - تعداد پیام‌ها
 * @returns {Promise<Array<object>>}
 */
async function getMessagesBefore(groupType, roomId, timestamp, count = 50) {
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

    // یک محدوده برای تاریخ‌های قدیمی‌تر از timestamp ایجاد می‌کنیم
    const range = IDBKeyRange.upperBound(timestamp, true); // true یعنی خود تاریخ را شامل نشود

    const request = index.openCursor(range, 'prev');

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
