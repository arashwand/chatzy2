// -------------------------
// فایل اصلی (ادغام‌شده با راهنمای PWA + Notification)
// توجه: تمام توابع و منطق اصلی حفظ شده‌اند.
// -------------------------

// -------------------------
// متغیرهای پایه
// -------------------------
const $notifModal = new bootstrap.Modal(document.getElementById("notif-modal"));
const VAPID_PUBLIC_KEY = window.VAPID_PUBLIC_KEY;

// تبدیل کلید VAPID
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
    return output;
}

// -------------------------
// مدیریت وضعیت دکمه (UI)
// -------------------------
function setSwitchState(isChecked, isDisabled) {
    const $switch = $("#notification-switch");
    $switch.prop("checked", isChecked);
    $switch.prop("disabled", isDisabled);
}

// -------------------------
// تابع کمکی: حذف اشتراک از سرور با استفاده از کش
// -------------------------
async function cleanupServerSubscription() {
    const storedEndpoint = localStorage.getItem('cached_push_endpoint');

    if (storedEndpoint) {
        console.log("Cleaning up subscription from server...");
        try {
            await fetch('/api/chat/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: storedEndpoint })
            });
            console.log("Server cleanup successful.");
        } catch (err) {
            console.error("Server cleanup failed:", err);
        }
        // در هر صورت کش را پاک کن تا دوباره تلاش نکند
        localStorage.removeItem('cached_push_endpoint');
    }
}

// -------------------------
// عملیات اصلی: ساخت اشتراک و ارسال به سرور
// -------------------------
async function subscribeAndSendToServer(registration) {
    try {
        // ۱. دریافت یا ساخت اشتراک
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }

        // ۲. ارسال به سرور
        const response = await fetch('/api/chat/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        // ۳. ذخیره Endpoint در حافظه مرورگر برای روز مبادا (لغو اشتراک)
        localStorage.setItem('cached_push_endpoint', subscription.endpoint);

        console.log('Server synced successfully.');
        return true;

    } catch (err) {
        console.error("Subscription error:", err);
        return false;
    }
}

// -------------------------
// توابع کمکی تشخیص پلتفرم / iOS
// -------------------------
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function isInStandaloneMode() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
        || window.navigator.standalone;
}

function isAndroid() {
    return /Android/i.test(navigator.userAgent);
}

function isDesktop() {
    return !isAndroid() && !isIOS() && !/Mobile|Tablet/i.test(navigator.userAgent);
}

function getiOSVersion() {
    const ua = navigator.userAgent;

    // الگوی تشخیص iOS
    const match = ua.match(/OS (\d+)_?(\d+)?_?(\d+)?/);

    if (!match) return null;

    const major = parseInt(match[1] || "0");
    const minor = parseInt(match[2] || "0");
    const patch = parseInt(match[3] || "0");

    // تبدیل به نسخه اعشاری برای مقایسه راحت (مثلاً 16.4)
    const version = parseFloat(`${major}.${minor}${patch > 0 ? patch : ''}`);

    return version;
}

function isiOSAbove164() {
    const v = getiOSVersion();
    if (!v) return false; // یعنی iOS نیست
    return v >= 16.4;
}

// -------------------------
// منطق هوشمند بررسی وضعیت (هنگام لود صفحه)
// -------------------------
async function initializeNotificationLogic() {
    try {
        const registration = await navigator.serviceWorker.ready;
        const permission = Notification.permission;
        let subscription = await registration.pushManager.getSubscription();

        const isiOSDevice = isIOS();
        const isStandalone = isInStandaloneMode();
        const isiOSSupported = isiOSDevice && isiOSAbove164() && isStandalone;

        // ---------------------------------------------------------
        // اگر iPhone باشد ولی:
        // 1) نسخه زیر 16.4 باشد
        // 2) یا PWA نصب نشده باشد (standalone=false)
        // → هیچ UI و پیامی نمایش نده (صرفاً راهنمای PWA اگر لازم است)
        // ---------------------------------------------------------
        if (isiOSDevice && !isiOSSupported) {
            console.log("iOS device detected but Web Push is NOT supported (version < 16.4 OR not standalone).");

            // اگر نسخه >=16.4 اما standalone نیست، بهتر است راهنمای نصب PWA نشان دهیم.
            if (isiOSDevice && isiOSAbove164() && !isStandalone) {
                // نمایش modal نصب PWA (فوری و تنها یک بار)
                if (window.userIsLoggedIn && !localStorage.getItem('pwaInstallPromptShown')) {
                    // تاخیر کوچک برای نرمی UX
                    setTimeout(() => {
                        showPwaInstallModal();
                    }, 2000);
                }
            } else {
                // iOS قدیمی‌تر از 16.4 — فقط آلارت متنی کوچک نمایش داده می‌شود (در UI اصلی)
                // این نمایش در بخش document.ready هم انجام می‌شد؛ اینجا هم لاگ کافی است.
            }
            return;
        }

        // === ادامه فقط برای دستگاه‌های پشتیبانی‌شده ===

        // ---------------------------------------------------------
        // حالت ۱: کاربر قبلاً اجازه داده (granted)
        // ---------------------------------------------------------
        if (permission === "granted") {
            setSwitchState(true, true);

            // اتوماتیک اشتراک را بساز و بفرست (سینک کردن)
            const success = await subscribeAndSendToServer(registration);

            if (success && !subscription) {
                // اگر تازه ساخته شد
                Swal.fire({
                    title: 'فعال شد',
                    text: 'تنظیمات مرورگر شناسایی شد و اعلان‌ها فعال شدند.',
                    icon: 'success',
                    timer: 3000,
                    showConfirmButton: false
                });
            }
            return;
        }

        // ---------------------------------------------------------
        // حالت ۲: کاربر مسدود کرده است (denied)
        // ---------------------------------------------------------
        if (permission === "denied") {
            setSwitchState(false, true);

            // *** نکته کلیدی اینجاست ***
            // اگر قبلاً اشتراک داشته (در localStorage هست) اما الان Denied شده، به سرور بگو پاک کنه
            await cleanupServerSubscription();

            // بررسی localStorage برای جلوگیری از نمایش مجدد
            if (localStorage.getItem('notification_denied_dont_show') === 'true') {
                return;
            }

            Swal.fire({
                title: 'دسترسی مسدود است',
                text: 'شما دسترسی اعلان‌ها را مسدود کرده‌اید. برای دریافت اعلان‌ها آن را فعال نمایید.',
                icon: 'error',
                showCancelButton: true,
                confirmButtonText: 'باشه',
                cancelButtonText: 'دیگه نمایش نده'
            }).then((result) => {
                if (result.isDismissed) {
                    localStorage.setItem('notification_denied_dont_show', 'true');
                }
            });
            return;
        }

        // ---------------------------------------------------------
        // حالت ۳: حالت پیش‌فرض (default)
        // ---------------------------------------------------------
        if (permission === "default") {
            setSwitchState(false, false);

            // اینجا هم ممکن است کاربر قبلاً داشته و Reset کرده باشد
            await cleanupServerSubscription();

            // برای دسکتاپ و اندروید: همیشه درخواست اجازه بده (بدون SweetAlert)
            // اما برای iOS پشتیبانی‌شده (standalone + >=16.4) از Swal استفاده کن
            if (window.userIsLoggedIn) {
                // برای iOS در حالت PWA (standalone): از Swal استفاده می‌کنیم تا توضیح دهیم
                if (isiOSDevice && isStandalone) {
                    // مکث کوتاه برای باز شدن UI صحیح
                    setTimeout(() => {
                        showIOSNotificationEnablePrompt();
                    }, 1000);
                } else {
                    // Android / Desktop: درخواست سریع (یا با تاخیر 1s) بدون Swal سنگین
                    setTimeout(() => {
                        // پیشنهاد فعال‌سازی با Swal چون تو خواستی Notification با Swal باشه
                        Swal.fire({
                            title: 'دریافت اعلان پیام‌ها',
                            text: 'آیا می‌خواهید وقتی پیامی می‌آید مطلع شوید؟',
                            icon: 'question',
                            showCancelButton: true,
                            confirmButtonText: 'بله، فعال کن',
                            cancelButtonText: 'خیر'
                        }).then((result) => {
                            if (result.isConfirmed) {
                                requestAndEnable();
                            }
                        });
                    }, 1000);
                }
            }
        }

    } catch (err) {
        console.error("Init error:", err);
    }
}

// -------------------------
// درخواست دسترسی (دکمه UI)
// -------------------------
async function requestAndEnable() {
    try {
        const permission = await Notification.requestPermission();

        if (permission === "granted") {
            const registration = await navigator.serviceWorker.ready;
            const success = await subscribeAndSendToServer(registration);

            if (success) {
                setSwitchState(true, true);
                Swal.fire('موفق', 'اعلان‌ها فعال شدند.', 'success');
            } else {
                Swal.fire('خطا', 'مشکل در ارتباط با سرور.', 'error');
                setSwitchState(false, false);
            }
        } else {
            setSwitchState(false, true);
            // اینجا هم محض احتیاط
            await cleanupServerSubscription();
            Swal.fire('توجه', 'اجازه اعلان داده نشد.', 'warning');
        }
    } catch (err) {
        console.error(err);
    }
}

// -------------------------
// PWA Install Prompt (کدی که فرستادی، با چند اصلاح کوچک در تایمینگ)
// -------------------------
let deferredPrompt;
const pwaInstallModalEl = document.getElementById('pwa-install-modal');
const pwaInstallModal = pwaInstallModalEl ? new bootstrap.Modal(pwaInstallModalEl) : null;
const btnInstallPWA = document.getElementById('btnInstallPWA');
const btnCancelInstall = document.getElementById('btnCancelInstall');

function setModalContent() {
    if (!pwaInstallModalEl) return;
    const title = pwaInstallModalEl.querySelector('.modal-header h3');
    const body = pwaInstallModalEl.querySelector('.modal-body p');
    const btn = document.getElementById('btnInstallPWA');
    if (isIOS()) {
        title.textContent = 'افزودن به صفحه اصلی';
        body.textContent = 'برای افزودن به صفحه اصلی، روی دکمه Share ضربه بزنید و سپس Add to Home Screen را انتخاب کنید.';
        btn.textContent = 'باشه';
    } else if (deferredPrompt) {
        // Default for browsers with prompt
        title.textContent = 'نصب اپلیکیشن';
        body.textContent = 'برای تجربه بهتر، اپلیکیشن را روی دستگاه خود نصب کنید.';
        btn.textContent = 'نصب اپلیکیشن';
    } else {
        // For desktop/Android without prompt
        title.textContent = 'نصب اپلیکیشن';
        body.textContent = 'برای نصب، آیکون نصب را در نوار آدرس مرورگر پیدا کنید.';
        btn.textContent = 'باشه';
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // نمایش modal اگر کاربر لاگین کرده و قبلاً نصب نکرده
    if (window.userIsLoggedIn && !localStorage.getItem('pwaInstallPromptShown')) {
        setModalContent();
        // نمایش با تاخیر 30s (مثل تو) — اما می‌تونیم این مقدار را تنطیم کنیم
        setTimeout(() => {
            showPwaInstallModal();
        }, 30000);
    }
});

if (btnInstallPWA) {
    btnInstallPWA.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            if (pwaInstallModal) pwaInstallModal.hide();
            localStorage.setItem('pwaInstallPromptShown', 'true');
        } else {
            if (pwaInstallModal) pwaInstallModal.hide();
            localStorage.setItem('pwaInstallPromptShown', 'true');
        }
    });
}

if (btnCancelInstall) {
    btnCancelInstall.addEventListener('click', () => {
        localStorage.setItem('pwaInstallPromptShown', 'true');
        if (pwaInstallModal) pwaInstallModal.hide();
    });
}

// For iOS devices — نمایش سریع‌تر
if (isIOS() && !isInStandaloneMode() && window.userIsLoggedIn && !localStorage.getItem('pwaInstallPromptShown')) {
    setTimeout(() => {
        setModalContent();
        showPwaInstallModal();
    }, 2000);
}

// For desktop devices — نمایش سریع
if (isDesktop() && window.userIsLoggedIn && !localStorage.getItem('pwaInstallPromptShown')) {
    setTimeout(() => {
        setModalContent();
        showPwaInstallModal();
    }, 2000);
}

// helper to safely show pwa modal
function showPwaInstallModal() {
    if (pwaInstallModal) {
        setModalContent();
        pwaInstallModal.show();
    } else {
        // اگر modal در HTML نیست، یک alert ساده نمایش بده (تا فایل ناقص نشود)
        console.log("PWA modal not found in DOM. Set 'pwaInstallModal' HTML to show PWA instructions.");
        // fallback: از Swal استفاده کن
        if (!localStorage.getItem('pwaInstallPromptShown')) {
            Swal.fire({
                title: isIOS() ? 'افزودن به صفحه اصلی' : 'نصب اپلیکیشن',
                html: isIOS()
                    ? 'برای افزودن: روی دکمه Share بزنید و سپس <strong>Add to Home Screen</strong> را انتخاب کنید.'
                    : 'برای نصب، آیکون نصب را در نوار آدرس مرورگر پیدا کنید.',
                confirmButtonText: 'باشه'
            }).then(() => localStorage.setItem('pwaInstallPromptShown', 'true'));
        }
    }
}

// -------------------------
// event: وقتی PWA نصب شد
// -------------------------
window.addEventListener('appinstalled', (evt) => {
    console.log('PWA was installed.', evt);
    localStorage.setItem('pwaInstallPromptShown', 'true');

    // بعد از نصب، تاخیر کوچکی بده و سپس منطق نوتیف را اجرا کن تا پیشنهاد فعال‌سازی بیاید
    setTimeout(() => {
        initializeNotificationLogic();
    }, 1000);
});

// همچنین وقتی کاربر از طریق Add to Home Screen وارد شد (standalone true) صفحه reload نکرده باشیم
// بهتر است هنگام load بررسی کنیم اگر standalone شده، initialize را صدا بزنیم
window.addEventListener('load', () => {
    if (isInStandaloneMode()) {
        // اگر تازه نصب شده، ممکنه localStorage ست نشده باشد، بنابراین یکبار بنویس
        localStorage.setItem('pwaInstallPromptShown', 'true');
        // اجرای دوباره منطق نوتیف
        setTimeout(() => initializeNotificationLogic(), 1000);
    }
});

// -------------------------
// کمک: نمایش دینامیک یک modal راهنمای نوتیف (اگر در HTML نبود)
// -------------------------
function ensureNotifGuideModalExists() {
    if (document.getElementById('notif-guide-modal')) return;

    // یک modal ساده Bootstrap بساز
    const html = `
    <div class="modal fade" id="notif-guide-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content text-right">
          <div class="modal-header">
            <h5 class="modal-title">فعالسازی اعلان‌ها</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p id="notif-guide-body">برای دریافت اعلان‌ها روی <strong>Allow</strong> بزنید. اگر پنجره‌ی اجازه نمایش داده نشد یا مسدود است، از Settings -> Notifications اپلیکیشن را فعال کنید.</p>
            <p style="font-size:12px;color:#666">اگر آیفون دارید و این اپ را به صفحه اصلی اضافه کرده‌اید، هنگام نمایش درخواست روی Allow بزنید.</p>
          </div>
          <div class="modal-footer">
            <button type="button" id="notif-guide-confirm" class="btn btn-primary">فعال کن</button>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">بعداً</button>
          </div>
        </div>
      </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

function showIOSNotificationGuideModal() {
    // اگر modal ای وجود دارد که راهنمای نصب PWA هست (notif-guide-modal)، آن را نشان بده
    ensureNotifGuideModalExists();
    const modalEl = document.getElementById('notif-guide-modal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // دکمه فعال‌سازی داخل modal
    const btn = document.getElementById('notif-guide-confirm');
    btn.addEventListener('click', async () => {
        modal.hide();
        // بعد از بسته شدن modal، درخواست دسترسی نمایش داده شود
        await requestAndEnable();
    }, { once: true });
}

// -------------------------
// نمایش پیشنهاد فعال‌سازی نوتیف مخصوص iOS با SweetAlert2 (ترکیبی که خواستی)
// -------------------------
function showIOSNotificationEnablePrompt() {
    // متن سفارشی برای iOS
    const bodyText = `
    برنامه را بر روی صفحه اصلی نصب کرده‌اید — عالی!<br>
    برای دریافت اعلان‌ها لطفاً <strong>Allow</strong> را در پنجره‌ی مرورگر بزنید.
    `;
    Swal.fire({
        title: 'فعال‌سازی اعلان‌ها',
        html: bodyText,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'فعال کن',
        cancelButtonText: 'بعداً'
    }).then((result) => {
        if (result.isConfirmed) {
            requestAndEnable();
        }
    });
}


// نمایش بخش تصویری مناسب در pwa-install-modal هنگام باز شدن
function updatePwaModalVisuals() {
    const iosGuide = document.getElementById('pwa-ios-guide');
    const genericGuide = document.getElementById('pwa-generic-guide');

    if (!iosGuide || !genericGuide) return;

    if (isIOS()) {
        iosGuide.classList.remove('d-none');
        genericGuide.classList.add('d-none');
    } else {
        iosGuide.classList.add('d-none');
        genericGuide.classList.remove('d-none');
    }
}

// hook: وقتی modal باز می‌شود
if (pwaInstallModalEl) {
    pwaInstallModalEl.addEventListener('show.bs.modal', () => {
        updatePwaModalVisuals();
        setModalContent(); // تابع قبلی برای متن/دکمه
    });
}




// -------------------------
// شروع برنامه (document.ready)
// -------------------------
$(document).ready(function () {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        initializeNotificationLogic();
    } else {
        $("#notification-switch").prop("disabled", true);
    }

    $("#notification-switch").on("change", function (e) {
        e.preventDefault();
        if ($(this).is(":checked")) {
            requestAndEnable();
        }
    });

    $("#btnEnableNotif").click(function () {
        $notifModal.hide();
        requestAndEnable();
    });

    // تشخیص آیفون و نمایش پیام‌های راهنما (بخشی از کد اصلی)
    const isiOS = isIOS();
    const supportsPush = 'serviceWorker' in navigator && 'PushManager' in window;
    const isStandalone = isInStandaloneMode();

    if (isiOS) {
        const $container = $("#notification-switch").parent(); // محل نمایش پیام

        if (!supportsPush) {
            // حالت ۱: آیفون قدیمی (زیر ۱۶.۴)
            // چون PushManager ندارد، دکمه سوییچ خودکار غیرفعال شده است.
            // فقط پیام راهنما می‌دهیم:
            $container.after(`
            <div class="alert alert-danger mt-2" style="font-size: 12px;">
                نسخه iOS شما قدیمی است.<br>
                برای دریافت اعلان‌ها، باید iOS خود را به نسخه <strong>16.4 یا بالاتر</strong> ارتقا دهید.
            </div>
        `);
        }
        else if (supportsPush && !isStandalone) {
            // حالت ۲: آیفون جدید است اما در سافاری باز شده (PWA نیست)
            // دکمه سوییچ را مخفی یا غیرفعال می‌کنیم تا کاربر گیج نشود
            $("#notification-switch").prop("disabled", true);

            $container.after(`
            <div class="alert alert-warning mt-2" style="font-size: 12px;">
                <strong>فعال‌سازی در آیفون:</strong><br>
                این قابلیت در iOS فقط زمانی کار می‌کند که سایت را نصب کنید:
                <br>
                ۱. دکمه <b>Share</b> (مربع و فلش) در پایین مرورگر را بزنید.
                <br>
                ۲. گزینه <b>"Add to Home Screen"</b> را انتخاب کنید.
                <br>
                ۳. برنامه را ببندید و از آیکون جدید روی صفحه اصلی وارد شوید.
            </div>
        `);
        }
        // حالت ۳: اگر supportsPush باشد و isStandalone باشد، یعنی همه چیز عالی است
        // و کد اصلی (initializeNotificationLogic) کار خود را انجام می‌دهد.
    }

    // -------------------------
    // اگر کاربر PWA را نصب کرد یا standalone شد و هنوز پیشنهاد نصب PWA نشان داده نشده،
    // بهتر است localStorage را تنظیم کنیم.
    // -------------------------
    if (isInStandaloneMode()) {
        localStorage.setItem('pwaInstallPromptShown', 'true');
    }
});
