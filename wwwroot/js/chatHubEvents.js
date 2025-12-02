// این فایل عملیات DOM و event handlers مربوط به چت را شامل می‌شود.
// باید بعد از chatHub.js لود شود تا window.chatApp در دسترس باشد.

$(document).ready(function() {

    // کدهای داخل $(document).ready از فایل اصلی
    let isRecording = false;
    let isProcessing = false;
    let mediaRecorder;
    let audioChunks = [];
    let recordingTimerInterval = null; // For UI timer
    let recordingChunkerInterval = null; // For sending chunks
    let recordingId = null;
    let chunkIndex = 0;
    window.lastRecordedBlob = null; // To hold the final blob for preview
    window.voiceUploadTimeout = null; // To handle SignalR timeout
    let pendingVoiceFileId = null;
    let pendingVoiceUrl = null; // برای پخش پیش‌نمایش
    let pendingVoiceAudioElement = null; // برای کنترل پخش
    let currentMimeType = 'audio/webm'; // متغیر جدید برای ذخیره فرمت پشتیبانی شده
    let isAudioProcessing = false;
    let isAjaxProcessing = false;
    let wakeLock = null; // متغیر جهانی برای Wake Lock

    // ======================================================================
    //             VOICE RECORDING EVENT HANDLERS
    // ======================================================================


    // تابع اصلی برای مدیریت نمایش UI در حالت‌های مختلف
    function updateChatInputUI(state, data = {}) {
        console.log('state is : ******************************************************************' + state);
        const textInputArea = $('#text-input-area');
        const voiceInputArea = $('#voice-input-area');
        const messageInput = $('#message-input');
        const sendButton = $('#send-message-button');

        // اگر المان‌ها پیدا نشدند، عملیات را متوقف کن
        if (textInputArea.length === 0 || voiceInputArea.length === 0) {
            console.error('خطای بحرانی: کانتینرهای ورودی پیدا نشدند!');
            return;
        }

        // بازگرداندن به حالت پیش‌فرض
        if (state === 'default') {
            voiceInputArea.hide().empty();
            textInputArea.show();
            messageInput.prop('disabled', false);
            sendButton.show();
            return;
        }

        // آماده‌سازی برای نمایش UI صدا
        textInputArea.hide();
        messageInput.prop('disabled', true);
        sendButton.hide();

        voiceInputArea.show().empty(); // ابتدا کانتینر را خالی کرده و نمایش بده
        let html = '';

        switch (state) {
            case 'recording':
                html = `
            <div id="voice-ui-container" class="voice-ui-container recording-state">
                <div class="voice-recording-content">
                    <span class="recording-indicator">
                        <span class="recording-dot"></span>
                        <span class="recording-timer">0:00</span>
                    </span>
                    <button class="voice-action-btn stop-recording-btn" type="button" title="توقف ضبط">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="8" y="8" width="8" height="8" fill="#dc3545"/>
                        </svg>
                    </button>
                    <span class="recording-text">در حال ضبط...</span>
                </div>
            </div>`;
                break;

            case 'processing':
                html = `
            <div id="voice-ui-container" class="voice-ui-container processing-state">
                <div class="voice-processing-content">
                    <div class="spinner-container">
                        <div class="spinner"></div>
                    </div>
                    <span class="processing-text">در حال پردازش صوت...</span>
                </div>
            </div>`;
                break;

            case 'preview':
                html = `
    <div id="voice-ui-container" class="voice-ui-container preview-state">
        <div class="voice-preview-content">
            <button class="voice-action-btn play-pause-btn" type="button" title="پخش/توقف">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 5V19L19 12L8 5Z" fill="#292D32"/>
                </svg>
            </button>
            
            <div class="voice-player-container">
                <input type="range" class="voice-timeline" value="0" max="${data.duration || 100}" step="0.1">
            </div>
            
            <span class="voice-duration">${data.durationFormatted || '0:00'}</span>
            
            <a class="voice-action-btn delete-btn" title="حذف">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 6H5H21" stroke="#dc3545" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M8 6V4C8 3.46957 8 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="#dc3545" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </a>
            
            <a class="voice-action-btn send-btn" title="ارسال">
               <img src="/chatzy/assets/iconsax/send-btn1.svg" alt="send" />
            </a>
        </div>
    </div>`;
                break;
        }

        console.log(html);
        voiceInputArea.html(html);
    }

    // --- توابع اصلی برای کنترل ضبط ---

    function startRecording() {
        if (isRecording || isProcessing) return;

        // 1. بررسی پشتیبانی مرورگر
        if (MediaRecorder.isTypeSupported('audio/ogg')) {
            currentMimeType = 'audio/ogg';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            currentMimeType = 'audio/webm';
        } else {
            alert('متاسفانه مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.');
            return;
        }

        // 2. درخواست دسترسی به میکروفون
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            isRecording = true;
            changeIcon($('.btn-record-voice'), 'stop');
            updateChatInputUI('recording');

            // درخواست Wake Lock برای جلوگیری از خاموش شدن صفحه
            if ('wakeLock' in navigator) {
                navigator.wakeLock.request('screen').then(lock => {
                    wakeLock = lock;
                    console.log('Wake Lock acquired');
                }).catch(err => {
                    console.error('Wake Lock request failed:', err);
                });
            }

            // ریست کردن متغیرها برای ضبط جدید
            audioChunks = [];
            recordingId = crypto.randomUUID();
            chunkIndex = 0;

            let seconds = 0;
            const timerSpan = $('.recording-timer');
            recordingTimerInterval = setInterval(() => {
                seconds++;
                const min = Math.floor(seconds / 60);
                const sec = seconds % 60;
                timerSpan.text(`${min}:${sec.toString().padStart(2, '0')}`);
            }, 1000);

            try {
                mediaRecorder = new MediaRecorder(stream, { mimeType: currentMimeType });

                // داده‌های صوتی را جمع‌آوری کن
                mediaRecorder.ondataavailable = e => {
                    if (e.data.size > 0) audioChunks.push(e.data);
                };

                // وقتی ضبط متوقف شد، آخرین قطعه را پردازش و ارسال کن
                mediaRecorder.onstop = () => {
                    stream.getTracks().forEach(track => track.stop());
                    processAndSendFinalChunk();
                };

                mediaRecorder.start(); // شروع ضبط

                // هر 1 ثانیه، قطعات جمع‌آوری شده را ارسال کن
                recordingChunkerInterval = setInterval(processAndSendIntermediateChunks, 5000);

            } catch (err) {
                console.error("خطا در ایجاد MediaRecorder:", err);
                alert("خطا در راه‌اندازی ضبط صدا.");
                cleanupVoiceState();
            }

        }).catch(err => {
            console.error("خطا در دسترسی به میکروفون:", err);
            alert(`خطا در دسترسی به میکروفون: ${err.name} - ${err.message}`);
            cleanupVoiceState();
        });
    }

    function stopRecording() {
        if (!isRecording) return;
        isRecording = false;
        isProcessing = true; // وارد حالت پردازش شو

        clearInterval(recordingTimerInterval);
        clearInterval(recordingChunkerInterval); // تایمر ارسال قطعات را متوقف کن

        changeIcon($('.btn-record-voice'), 'microphone');
        updateChatInputUI('processing');

        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop(); // این کار رویداد onstop را فعال می‌کند
        } else {
            console.warn('MediaRecorder در حالت ضبط نبود. در حال ریست وضعیت.');
            cleanupVoiceState();
        }
    }

    // قطعات میانی را پردازش و ارسال می‌کند
    function processAndSendIntermediateChunks() {
        if (audioChunks.length === 0) return;

        // یک Blob از تمام قطعات موجود بساز
        const chunkBlob = new Blob(audioChunks, { type: currentMimeType });
        audioChunks = []; // آرایه را برای قطعات بعدی خالی کن

        sendAudioChunk(chunkBlob, false); // ارسال به عنوان قطعه میانی
    }

    // آخرین قطعه را پردازش و ارسال می‌کند
    function processAndSendFinalChunk() {
        const finalBlob = new Blob(audioChunks, { type: currentMimeType });
        audioChunks = [];

        if (finalBlob.size > 0) {
            // آخرین قطعه را برای استفاده در پیش‌نمایش پس از دریافت پاسخ SignalR ذخیره کن
            window.lastRecordedBlob = finalBlob;
            sendAudioChunk(finalBlob, true); // ارسال به عنوان آخرین قطعه
        } else {
            console.warn("آخرین قطعه صدا خالی بود. چیزی برای ارسال وجود ندارد.");
            cleanupVoiceState();
        }
    }

    // تابع اصلی برای ارسال هر قطعه به سرور
    function sendAudioChunk(audioBlob, isLastChunk) {
        if (!recordingId) {
            console.error("شناسه ضبط وجود ندارد.");
            if (isLastChunk) cleanupVoiceState();
            return;
        }

        const formData = new FormData();
        formData.append('file', audioBlob, `chunk.webm`);
        formData.append('recordingId', recordingId);
        formData.append('chunkIndex', chunkIndex);
        formData.append('isLastChunk', isLastChunk);

        if (isLastChunk) {
            // ارسال آخرین قطعه و انتظار برای پاسخ نهایی
            $.ajax({
                url: '/api/Chat/UploadAudioChunk',
                type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                dataType: 'json', // انتظار دریافت JSON داریم
                success: function (data) {
                    console.log("پاسخ نهایی سرور دریافت شد:", data);

                    // استفاده از camelCase مطابق با کد جدید C#
                    if (data && data.success && data.recordingId === recordingId) {
                        pendingVoiceFileId = data.fileId;

                        if (window.lastRecordedBlob) {
                            pendingVoiceUrl = URL.createObjectURL(window.lastRecordedBlob);
                            pendingVoiceAudioElement = new Audio(pendingVoiceUrl);

                            // اضافه کردن شناسه فایل به لیست فایل‌های آماده ارسال
                            addFileIdToHiddenInput(data.fileId, '#uploadedFileIds');

                            isProcessing = false;

                            // بروزرسانی UI به حالت پیش‌نمایش
                            updateChatInputUI('preview', {
                                duration: data.duration,
                                durationFormatted: data.durationFormatted
                            });
                        } else {
                            console.error("Blob فایل نهایی یافت نشد.");
                            cleanupVoiceState();
                        }
                    } else {
                        console.error("پاسخ سرور نامعتبر بود:", data);
                        alert("خطا در پردازش فایل صوتی.");
                        cleanupVoiceState();
                    }
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    // مدیریت خطاهای شبکه یا سرور (500, 404, Timeout, etc.)
                    console.error('خطا در ارسال آخرین قطعه:', textStatus, errorThrown);
                    alert('خطای ارتباط با سرور. لطفاً دوباره تلاش کنید.');
                    cleanupVoiceState();
                }
            });
        } else {
            // ارسال قطعات میانی (بدون نیاز به انتظار برای پاسخ)
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/Chat/UploadAudioChunk', formData);
            } else {
                $.ajax({
                    url: '/api/Chat/UploadAudioChunk',
                    type: 'POST',
                    data: formData,
                    processData: false,
                    contentType: false,
                    async: true // غیرهمزمان واقعی، نیازی به منتظر ماندن نیست
                });
            }
        }

        chunkIndex++;
    }

    /**
     * ریست متغیر های ایجاد شده در هنگام ضبط صده
     * @param {any} deleteFromServer : این متغیر مشخص میکند ایا فایل هم حذف شود یا خیر
     */
    function cleanupVoiceState(deleteFromServer = false, voiceWasSent = false) {
        // Stop any running timers
        if (recordingTimerInterval) clearInterval(recordingTimerInterval);
        if (recordingChunkerInterval) clearInterval(recordingChunkerInterval);
        if (window.voiceUploadTimeout) {
            clearTimeout(window.voiceUploadTimeout);
            window.voiceUploadTimeout = null;
        }
        recordingTimerInterval = null;
        recordingChunkerInterval = null;
        window.lastRecordedBlob = null;

        // آزاد کردن Wake Lock
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
            console.log('Wake Lock released');
        }

        if (deleteFromServer && pendingVoiceFileId) {
            // ارسال درخواست حذف به سرور با فرمت JSON
            $.ajax({
                url: '/Home/DeleteFile',
                type: 'POST',
                contentType: 'application/json', // تنظیم Content-Type به JSON
                data: JSON.stringify({ FileId: pendingVoiceFileId }), // تبدیل داده به JSON
                success: function (response) {
                    if (response && response.success) {
                        console.log('فایل با موفقیت از سرور حذف شد. fileId:', response.fileId);
                        $('#uploadedFileIds').val('');
                    } else {
                        console.error('خطا در حذف فایل از سرور:', response ? response.message : 'پاسخ نامعتبر');
                        alert('خطا در حذف فایل از سرور: ' + (response ? response.message : 'پاسخ نامعتبر'));
                    }
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    console.error('خطای ارتباطی در حذف فایل:', textStatus, errorThrown);
                    alert('خطای ارتباطی هنگام حذف فایل از سرور.');
                }
            });
        }

        // ریست متغیرها
        isProcessing = false;
        isRecording = false;
        if (pendingVoiceUrl && !voiceWasSent) {
            URL.revokeObjectURL(pendingVoiceUrl);
        }
        pendingVoiceFileId = null;
        pendingVoiceUrl = null;
        pendingVoiceAudioElement = null;
        audioChunks = [];
        recordingId = null;
        chunkIndex = 0;


        // بازگشت به حالت پیش‌فرض
        updateChatInputUI('default');
        changeIcon($('.btn-record-voice'), 'microphone');
    }


    function addFileIdToHiddenInput(serverFileId, containerSelector) {
        const hiddenInput = $(containerSelector);
        let currentIds = hiddenInput.val() ? hiddenInput.val().split(',') : [];
        if (!currentIds.includes(serverFileId)) {
            currentIds.push(serverFileId);
            hiddenInput.val(currentIds.join(','));
        }
    }


    // --- مدیریت رویدادها با Event Delegation ---

    // کلیک روی دکمه میکروفون/توقف
    $(document).on('click', '.btn-record-voice', function (e) {
        console.log('btn-record-voice clicked', e.target);
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    $(document).on('click', '.stop-recording-btn', function () {

        stopRecording();

    });

    // کلیک روی دکمه حذف پیش‌نمایش
    $(document).on('click', '.delete-btn', function () {
        cleanupVoiceState(true, false); // true یعنی از سرور هم حذف کن
    });

    // تابع برای تغییر آیکون
    function changeIcon(button, iconType) {
        if (iconType === 'stop') {
            button.html(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#fff">
                <g clip-path="url(#clip0_4418_4367)">
                <path opacity="0.4" d="M11.9702 22C17.4931 22 21.9702 17.5228 21.9702 12C21.9702 6.47715 17.4931 2 11.9702 2C6.44737 2 1.97021 6.47715 1.97021 6.47715 1.97021 17.5228 6.44737 22 11.9702 22Z" fill="white" style="fill: var(--fillg);"/>
                <path d="M10.77 16.2295H13.23C14.89 16.2295 16.23 14.8895 16.23 13.2295V10.7695C16.23 9.10953 14.89 7.76953 13.23 7.76953H10.77C9.11002 7.76953 7.77002 9.10953 7.77002 10.7695V13.2295C7.77002 14.8895 9.11002 16.2295 10.77 16.2295Z" fill="white" style="fill: var(--fillg);"/>
                </g>
                <defs>
                <clipPath id="clip0_4418_4367">
                <rect width="24" height="24" fill="white"/>
                </clipPath>
                </defs>
                </svg>`);
            button.attr('data-icon', 'stop');
        } else {
            button.html(`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- کد SVG آیکون میکروفون -->
            <path d="M12 15.5C14.21 15.5 16 13.71 16 11.5V6C16 3.79 14.21 2 12 2C9.79 2 8 3.79 8 6V11.5C8 13.71 9.79 15.5 12 15.5Z" stroke="#292D32" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4.3501 9.6499V11.3499C4.3501 15.5699 7.7801 18.9999 12.0001 18.9999C16.2201 18.9999 19.6501 15.5699 19.6501 11.3499V9.6499" stroke="#292D32" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M10.6101 6.43012C11.5101 6.10012 12.4901 6.10012 13.3901 6.43012" stroke="#292D32" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M11.2 8.55007C11.73 8.41007 12.28 8.41007 12.81 8.55007" stroke="#292D32" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M12 19V22" stroke="#292D32" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`);
            button.attr('data-icon', 'microphone');
        }
    }

    

    // کلیک روی دکمه پخش/توقف پیش‌نمایش
    $(document).on('click', '.play-pause-btn', function () {
        const icon = $(this).find('i');
        if (pendingVoiceAudioElement.paused) {
            pendingVoiceAudioElement.play();
            icon.attr('data-icon', 'pause');
        } else {
            pendingVoiceAudioElement.pause();
            icon.attr('data-icon', 'play');
        }
        init_iconsax(); // Re-render the icon

        pendingVoiceAudioElement.onended = () => {
            icon.attr('data-icon', 'play');
            init_iconsax();
            $('.voice-timeline').val(0); // ریست تایم‌لاین
        };
    });

    // همگام‌سازی تایم‌لاین با پخش صدا
    $(document).on('input', '.voice-timeline', function () {
        if (pendingVoiceAudioElement) {
            pendingVoiceAudioElement.currentTime = $(this).val();
        }
    });

    // نیاز داریم یک شنونده برای آپدیت تایم‌لاین در حین پخش اضافه کنیم
    setInterval(() => {
        if (pendingVoiceAudioElement && !pendingVoiceAudioElement.paused) {
            const timeline = $('.voice-timeline');
            if (timeline.length) {
                timeline.attr('max', pendingVoiceAudioElement.duration);
                timeline.val(pendingVoiceAudioElement.currentTime);
            }
        }
    }, 100); // هر 100 میلی‌ثانیه چک کن

    // ####################################################################### End Audio Recording


    //  رویداد کلیک برای دکمه ارسال پیام
    $(document).off('click', '#send-message-button, .send-btn').on('click', '#send-message-button, .send-btn', function () {
        const groupId = parseInt($('#current-group-id-hidden-input').val());
        const groupType = $('#current-group-type-hidden-input').val();

        console.log('groupType==================== ' + groupType);
        // ---- ارسال پیام صوتی ----
        if (pendingVoiceFileId) {

            console.log("ارسال پیام صوتی...");

            // ۱. ساخت شناسه موقت برای پیام
            const clientMessageId = crypto.randomUUID();

            // ۲. ساخت آبجکت فایل صوتی برای نمایش فوری
            const voiceFileObject = {
                fileName: `voice-message.${currentMimeType.split('/')[1]}`,
                fileType: 'audio',
                messageFileId: pendingVoiceFileId, // شناسه موقت فایل تا زمان تایید سرور
                fileThumbPath: pendingVoiceUrl, // <-- کلید اصلی: استفاده از آدرس blob محلی
                fileSize: '' // حجم فعلا مهم نیست
            };

            // ۳. ساخت آبجکت پیام خوشبینانه
            const optimisticMessage = {
                messageId: null,
                groupId: groupId,
                groupType: groupType,
                messageText: "", // پیام صوتی متن ندارد
                messageDateTime: new Date().toISOString(),
                messageDate: new Date().toISOString(),
                senderUserId: parseInt($('#userId').val()),
                senderUserName: $('#fullName').val(),
                profilePicName: $('#userProfilePic').val(),
                clientMessageId: clientMessageId,
                status: 'sending', // نمایش آیکون ساعت
                replyToMessageId: null,
                replyMessage: null,
                messageFiles: [voiceFileObject] // آرایه‌ای حاوی فایل صوتی
            };
            console.log('optimistic message is : ' + optimisticMessage);
            // ۴. نمایش فوری پیام در UI کاربر
            window.chatApp.displayMessage(optimisticMessage);

            // ۵. ارسال پیام به سرور با شناسه فایل صوتی
            window.chatApp.sendMessage(groupId, "", groupType, null, [pendingVoiceFileId.toString()], clientMessageId);

            // ۶. پاکسازی UI ضبط صدا (بدون حذف فایل از سرور)
            cleanupVoiceState(false, true);

            // ۷. ریست کردن فرم اصلی (برای اطمینان)
            resetInputState();
        }
        else {
            console.log("ارسال پیام متنی/فایلی...");

            // ۱. خواندن مقادیر اصلی
            const messageText = $('#message-input').val().trim();
            const fileUploadedIds = collectServerIdsFromContainer('#uploadedFileIds');

            // اگر متنی برای ارسال وجود ندارد و فایلی هم نیست، خارج شو
            if ((!messageText && fileUploadedIds.length === 0) || !(groupId > 0)) {
                return;
            }

            // ۲. خواندن حالت ویرایش یا پاسخ
            const actionType = $('#message-action-type').val();
            const contextId = $('#message-context-id').val();

            // ۳. تصمیم‌گیری بر اساس نوع اکشن
            if (actionType === 'edit') {
                const contextId = parseInt($('#message-context-id').val());
                const messageText = $('#message-input').val();
                const newFileIds = collectServerIdsFromContainer('#uploadedFileIds');
                const deletedFileIds = collectServerIdsFromContainer('#deletUploadedFileIds');
                const previousFileIds = collectServerIdsFromContainer('#previousFileIds');

                // ترکیب لیست نهایی فایل‌ها
                // شروع با فایل‌های قبلی، حذف موارد حذف شده، و سپس اضافه کردن موارد جدید
                const finalFileIds = previousFileIds
                    .filter(id => !deletedFileIds.includes(id))
                    .concat(newFileIds);


                // فراخوانی متد ویرایش در API عمومی
                window.chatApp.editMessage(contextId, messageText, groupId, groupType, finalFileIds, deletedFileIds);

            } else if (actionType === 'reply') {
                // حالت پاسخ: فراخوانی متد ارسال پیام با پارامتر اضافی
                // فرض می‌کنیم متد sendMessage شما یک پارامتر پنجم برای شناسه پیامی که به آن پاسخ داده می‌شود، می‌پذیرد
                console.log(`Replying to message ${contextId} with text: "${messageText}"`);

                /**نمایش پیام بصورت فوری برای ارسال کننده*/
                var messageBlock = $(`.message[data-message-id="${contextId}"]`);
                //var replyMessageText = messageBlock.find('.message-content').text().trim(); // متن پیام اصلی

                var details;
                try {
                    details = JSON.parse(messageBlock.attr('data-message-details'));
                } catch (err) {
                    console.error("خطا در خواندن اطلاعات پیام برای پاسخ در حالت ارسال.", err);
                    return;
                }
                const replyMessageText = details.messageText; // از متن اصلی پیام از data-message-details استفاده کنید
                const replyMessageFiles = details.messageFiles;
                var replySenderName = messageBlock.data('sender-username'); // نام ارسال کننده پیام اصلی

                // 1. اطلاعات مربوط به پیام اصلی که به آن پاسخ داده می شود را آماده کنید
                const replyMessageDetails = {
                    messageText: replyMessageText,
                    senderUserName: replySenderName,
                    messageFiles: replyMessageFiles
                };

                // 2. ساخت پیام خوشبینانه با ارسال `replyToMessageId` و `replyMessageDetails`
                optimisticMessage = createOptimisticMessageBody(
                    groupId, messageText, groupType, parseInt(contextId), replyMessageDetails
                );

                //نمایش فوری پیام در UI  کاربر ارسال کننده
                window.chatApp.displayMessage(optimisticMessage);

                window.chatApp.sendMessage(groupId, messageText, groupType, parseInt(contextId), fileUploadedIds, optimisticMessage.clientMessageId);

            } else {
                // حالت عادی: ارسال یک پیام جدید (کد اصلی شما)
                console.log(`Sending new message: "${messageText}"`);

                /**نمایش پیام بصورت فوری برای ارسال کننده*/
                const optimisticMessage = createOptimisticMessageBody(groupId, messageText, groupType);

                window.chatApp.displayMessage(optimisticMessage);
                window.chatApp.sendMessage(groupId, messageText, groupType, null, fileUploadedIds, optimisticMessage.clientMessageId);
            }

        }
        // ۴. اقدامات پس از ارسال (برای هر سه حالت یکسان است)
        $('#message-input').val(''); // خالی کردن اینپوت
        resetInputState(); // ریست کردن حالت ویرایش/پاسخ و پاک کردن فیلدهای مخفی
        $('#filePreviewContainer').empty(); // کانتینر پیش‌نمایش فایل را خالی کن
        $('#uploadedFileIds').val(''); // شناسه‌های فایل های بارگذاری شده را پاک کن
        $('#deletUploadedFileIds').val(''); // شناسه‌های فایل های حذف شده را پاک کن
        window.chatApp.stopTyping(groupId, groupType); // اطلاع به سرور برای توقف نمایش "در حال تایپ"

        // اضافه کردن فوکوس دوباره برای نگه داشتن کیبورد در موبایل
        setTimeout(() => {
            $('#message-input').focus();
            window.scrollTo(0, document.body.scrollHeight);
        }, 50); // تأخیر کوتاه برای اطمینان از اعمال فوکوس

    });

    // ساخت پیام برای نمایش فوری
    function createOptimisticMessageBody(groupId, messageText, groupType, replyToMessageId = null, replyMessage = null) {
        console.log('inside createOptimisticMessageBody and grouptype : ' + groupType);
        const filePreviewContainer = $('#filePreviewContainer');
        const messageFiles = [];
        const fileAttachmentIds = [];

        // const _baseUrl = $('#baseUrl').val(); //جهت نمایش تصاویر پیشفرض
        //const demoImagefilePath = `${_baseUrl}assets/media/avatar/demo-img.png`

        console.log("File Preview Container:", filePreviewContainer.length ? "Found" : "Not Found", filePreviewContainer);

        filePreviewContainer.find('.file-preview-item').each(function (index) {
            const $this = $(this);

            // استخراج نام فایل
            const fileNameElement = $this.find('.file-info .file-name');
            const fileName = fileNameElement.text().trim();
            console.log("File Name Element found:", fileNameElement.length ? "Yes" : "No", "Text:", fileName);

            // استخراج مسیر تصویر پیش‌نمایش (برای فایل‌های تصویری)
            const imgElement = $this.find('.file-info .file-thumbnail');
            const fileThumbPath = imgElement.length ? imgElement.attr('src') : '';
            console.log("Image Element found:", imgElement.length ? "Yes" : "No", "src:", fileThumbPath);

            // بررسی وجود آیکون برای فایل‌های غیرتصویری
            const fileIcon = $this.find('.file-info .file-icon');
            console.log("File Icon found:", fileIcon.length ? "Yes" : "No");

            // استخراج حجم فایل
            const fileSizeElement = $this.find('.file-details .file-size');
            let fileSize = 0;
            if (fileSizeElement.length) {
                const fileSizeText = fileSizeElement.text().trim(); // مثال: "28.9 کیلوبایت"
                const sizeMatch = fileSizeText.match(/([\d.]+)\s*(کیلو|مگا)?بایت/);
                if (sizeMatch) {
                    fileSize = parseFloat(sizeMatch[1]) * (sizeMatch[2] === 'مگا' ? 1024 : 1) * 1024; // تبدیل به بایت
                }
            }

            // استخراج شناسه سرور
            const removeButton = $this.find('.remove-file-btn');
            const serverId = removeButton.data('server-id');
            console.log("Remove Button found:", removeButton.length ? "Yes" : "No", "data-server-id:", serverId);

            // تشخیص نوع فایل بر اساس پسوند
            const fileExtension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
            const isImage = window.chatApp.ALLOWED_IMAGES.includes(fileExtension);
            const fileType = isImage ? 'image' : 'non-image'; // میخواهیم چک کنیم اگه تصویر بود بر اون اساس تصمیم به ساخت بدنه بگیریم
            console.log("File Extension:", fileExtension, "File Type:", fileType);

            // ایجاد شیء FileExtension
            const fileExtensionDto = {
                extension: fileExtension,
                type: fileType,
            };

            //if (fileName && fileThumbPath)
            if (fileName) { // فقط در صورتی اضافه کن که هر دو مقدار موجود باشند
                messageFiles.push({
                    fileName: fileName, //'demo-img.png',
                    fileType: fileType,
                    messageFileId: serverId,
                    fileSize: fileSize,
                    fileThumbPath: fileThumbPath, // استفاده از مقدار خالی یا پیش‌فرض برای فایل‌های غیرتصویری
                    //FileThumbPath: fileThumbPath //demoImagefilePath
                    fileExtension: fileExtensionDto
                });
            } else {
                console.warn(`Skipping file #${index} due to missing fileName or fileThumbPath.`);
            }

            if (serverId) {
                fileAttachmentIds.push(serverId);
            }
        });

        console.log("Final messageFiles array:", messageFiles);
        console.log("Final fileAttachmentIds array:", fileAttachmentIds);


        const clientMessageId = crypto.randomUUID();
        userProfilePic = $('#userProfilePic').val();
        userNameFamily = $('#fullName').val();
        const optimisticMessage = {
            messageId: null,
            groupId: groupId,
            groupType: groupType,
            messageText: messageText,
            messageDateTime: new Date().toISOString(),
            messageDate: new Date().toISOString(),
            senderUserId: parseInt($('#userId').val()),
            senderUserName: userNameFamily,
            profilePicName: userProfilePic,

            clientMessageId: clientMessageId,
            status: 'sending',

            replyToMessageId: replyToMessageId,
            replyMessage: replyMessage, // <--- اینجا آبجکت replyMessage را مستقیماً پاس می‌دهیم
            messageFiles: messageFiles
        };

        return optimisticMessage;
    }




    //  رویدادهای مربوط به تایپ کردن کاربر
    let typingTimer;
    const TYPING_TIMEOUT = 2000; // ms

    // Typing
    $(document).off('input', '#message-input').on('input', '#message-input', function () {
        const groupId = parseInt($('#current-group-id-hidden-input').val());
        const groupType = $('#current-group-type-hidden-input').val();

        if (groupId > 0) {
            // به محض شروع تایپ، وضعیت را ارسال کن
            window.chatApp.sendTyping(groupId, groupType);

            // تایمر "توقف تایپ" را ریست کن
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                window.chatApp.stopTyping(groupId, groupType)
            }, TYPING_TIMEOUT);
        }
    });

    // actionEditMessage
    $(document).off('click', '.actionEditMessage').on('click', '.actionEditMessage', async function (e) { // <-- Make the handler async
        e.preventDefault();

        // ۱. پاک‌سازی کامل فرم از هر حالت قبلی (مهم)
        resetInputState();

        // ۲. استخراج اطلاعات
        var messageBlock = $(this).closest('.message');
        var messageId = messageBlock.data('message-id');

        var details;
        try {
            details = JSON.parse(messageBlock.attr('data-message-details'));
        } catch (err) {
            console.error("خطا در خواندن اطلاعات پیام برای ویرایش.", err);
            return;
        }

        // ۴. تنظیم حالت ویرایش
        $('#message-action-type').val('edit');
        $('#message-context-id').val(messageId);
        $('#cancel-edit-container').removeClass('force-hide'); // نمایش دکمه "انصراف"

        // ۵. پر کردن فرم با داده‌های پیام
        // پر کردن متن پیام

        const textarea = $('#message-input');
        const text = (details.messageText || '').replace(/<br\s*\/?>/g, '\n');
        textarea.val(text)

        // محاسبه تعداد خطوط
        const lines = text.split('\n').length;

        // تنظیم rows تا حداکثر 5
        textarea.attr('rows', Math.min(lines, 5));
        textarea.focus();

        // اگر پیام در پاسخ بوده، نمایش اطلاعات پاسخ
        if (details.replyToMessageId && details.replyMessage) { // اطمینان از وجود replyToMessageId و replyMessage
            $('#reply-to-user').text('پاسخ به: ' + (details.replyMessage.senderUserName || ''));
            $('#reply-to-text').text(details.replyMessage.messageText || '');
            $('#reply-to-container').show();
        }

        // اگر پیام فایل ضمیمه داشته، پیش‌نمایش آنها را بساز       
        $('#filePreviewContainer').empty(); // ابتدا کانتینر پیش‌نمایش را خالی کنید
        if (details.messageFiles && details.messageFiles.length > 0) {

            // Wait for allowed extensions to be loaded if they haven't been already
            if (window.chatApp.ALLOWED_IMAGES.length === 0) {
                await window.chatApp.callAlloewExtentions();
            }

            previousFileIds = details.messageFiles.map(f => f.messageFileId);

            details.messageFiles.forEach(file => {
                addExistingFileToPreview(file);
                // همچنین، شناسه‌های فایل‌های موجود را به hidden input اضافه کنید تا هنگام ویرایش و ارسال مجدد حفظ شوند
                addFileIdToHiddenInput(file.messageFileId.toString(), '#previousFileIds');
            });
        }


        // اسکرول به پایین صفحه برای دیدن فرم ورودی
        //document.querySelector('#message-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // رویداد کلیک برای دکمه انصراف از ویرایش
    $(document).on('click', '#cancel-edit-button', function () {
        resetInputState();
    });


    // actionReplyMessage
    $(document).off('click', '.actionReplyMessage').on('click', '.actionReplyMessage', function (e) {
        e.preventDefault();
        resetInputState();

        // همیشه تمام کانتینرهای پیش‌نمایش را قبل از استفاده پاک می‌کنیم
        $('#reply-thumbnail-container').empty();
        $('#reply-icon-container').empty();

        const messageBlock = $(this).closest('.message');
        const messageId = $(this).data('messageid');
        const senderName = messageBlock.data('sender-username');
        const messageDetailsStr = messageBlock.attr('data-message-details');

        let previewText = 'پیام'; // متن پیش‌فرض

        if (messageDetailsStr) {
            try {
                const messageDetails = JSON.parse(messageDetailsStr);
                const hasText = messageDetails.messageText && messageDetails.messageText.trim() !== '';
                const hasFiles = messageDetails.messageFiles && messageDetails.messageFiles.length > 0;

                // اگر پیام متن داشت، همیشه متن در اولویت است
                if (hasText) {
                    previewText = messageDetails.messageText;
                }
                // اگر متن نداشت ولی فایل داشت، نوع فایل را تشخیص می‌دهیم
                else if (hasFiles) {
                    const firstFile = messageDetails.messageFiles[0];
                    const fileName = firstFile.originalFileName || firstFile.fileName || '';
                    const fileExtension = fileName.split('.').pop().toLowerCase();

                    // 1. بررسی برای فایل صوتی (راه حل پایدار)
                    // ما 'webm' را مستقیماً چک می‌کنیم و همچنین لیست برنامه را هم در نظر می‌گیریم
                    if (fileExtension === 'webm' || (window.chatApp.ALLOWED_AUDIO && window.chatApp.ALLOWED_AUDIO.includes(fileExtension))) {
                        $('#reply-icon-container').html(' <img src="/chatzy/assets/iconsax/music-filter.svg" />');
                        previewText = 'فایل صوتی';
                    }
                    // 2. بررسی برای فایل تصویر
                    else if (window.chatApp.ALLOWED_IMAGES && window.chatApp.ALLOWED_IMAGES.includes(fileExtension)) {
                        const baseUrl = $('#baseUrl').val() || '';
                        const imageUrl = baseUrl + (firstFile.fileThumbPath || firstFile.filePath);
                        $('#reply-thumbnail-container').html(`<img src="${imageUrl}" class="reply-preview-thumbnail" alt="پیش‌نمایش">`);
                        previewText = 'عکس';
                    }
                    // 3. سایر فایل‌ها (داکیومنت و...)
                    else {
                        $('#reply-icon-container').html(' <img src="/chatzy/assets/iconsax/paperclip-2.svg" />');
                        previewText = fileName || 'فایل پیوست‌شده';
                    }
                }
            } catch (err) {
                console.error("خطا در خواندن data-message-details:", err);
                previewText = messageBlock.find('.message-box-details h5').text().trim() || 'پیام';
            }
        } else {
            previewText = messageBlock.find('.message-box-details h5').text().trim() || 'پیام';
        }

        // تنظیم اطلاعات و نمایش پنل
        $('#reply-to-user').text('پاسخ به: ' + senderName);
        $('#reply-to-text').text(previewText);
        $('#reply-to-container').show();

        // رندر کردن آیکون جدید (اگر از کتابخانه iconsax استفاده می‌کنید)
        if (typeof init_iconsax === 'function') {
            init_iconsax();
        }

        // تنظیم حالت پاسخ برای فرم
        $('#message-context-id').val(messageId);
        $('#message-action-type').val('reply');

        $('#message-input').val('').focus();
    });

    // actionSaveMessage
    $(document).off('click', '.actionSaveMessage').on('click', '.actionSaveMessage', function (e) {
        e.preventDefault();
        const groupId = $('#current-group-id-hidden-input').val();
        const groupType = $('#current-group-type-hidden-input').val();
        var messageId = $(this).data('messageid');
        console.log("در حال ذخیره پیام با شناسه: " + messageId);

        // ارسال درخواست ایجکس به کنترلر برای ذخیره پیام
        $.ajax({
            url: '/Home/SaveMessage', // آدرس کنترلر خود را جایگزین کنید
            type: 'POST',
            data: { messageId: messageId },
            success: function (response) {
                if (response.success) {
                    //alert('پیام با موفقیت ذخیره شد!');
                    Swal.fire({
                        title: 'موفق!',
                        text: 'پیام با موفقیت ذخیره شد!.',
                        icon: 'success',
                        confirmButtonText: 'باشه',
                        timer: 1000, // بسته شدن خودکار پس از ۳ ثانیه
                        showConfirmButton: false
                    });
                } else {
                    //alert('خطا در ذخیره پیام: ' + response.message);
                    Swal.fire({
                        title: 'خطا!',
                        text: 'خطا در حذف پیام ذخیره‌شده: ' + response.message,
                        icon: 'error',
                        confirmButtonText: 'باشه'
                    });
                }
            },
            error: function () {
                //alert('خطای ارتباط با سرور.');
                Swal.fire({
                    title: 'خطای ارتباط!',
                    text: 'خطای ارتباط با سرور. لطفاً دوباره تلاش کنید.',
                    icon: 'error',
                    confirmButtonText: 'باشه'
                });
            }
        });
    });

    // actionDeleteMessage  
    $(document).off('click', '.actionDeleteMessage').on('click', '.actionDeleteMessage', function (e) {
        e.preventDefault();
        const groupId = parseInt($('#current-group-id-hidden-input').val()); //$('#current-group-id-hidden-input').val();
        const groupType = $('#current-group-type-hidden-input').val();
        var messageId = $(this).data('messageid');
        console.log("در حال حذف پیام با شناسه: " + messageId);

        window.chatApp.userDeleteMessage(groupId, groupType, messageId);

    });

    // actionDeleteSavedMessage
    $(document).off('click', '.actionDeleteSavedMessage').on('click', '.actionDeleteSavedMessage', function (e) {
        e.preventDefault();
        const groupId = $('#current-group-id-hidden-input').val();
        const groupType = $('#current-group-type-hidden-input').val();
        var messageSavedId = $(this).data('messagesavedid');
        console.log("در حال حذف پیام ذخیره شده با شناسه: " + messageSavedId);

        // ارسال درخواست ایجکس به کنترلر برای ذخیره پیام
        $.ajax({
            url: '/Home/DeleteSavedMessage', 
            type: 'POST',
            data: { messageSavedId: messageSavedId },
            success: function (response) {
                if (response.success) {
                    const messageSaveIdToRemove = "#message-" + messageSavedId;
                    $(messageSaveIdToRemove).remove();
                    // نمایش پیام موفقیت با SweetAlert
                    Swal.fire({
                        title: 'موفق!',
                        text: 'پیام ذخیره‌شده با موفقیت حذف شد.',
                        icon: 'success',
                        confirmButtonText: 'باشه',
                        timer: 1000, // بسته شدن خودکار پس از ۳ ثانیه
                        showConfirmButton: false
                    });
                } else {
                    // نمایش پیام خطا با SweetAlert
                    Swal.fire({
                        title: 'خطا!',
                        text: 'خطا در حذف پیام ذخیره‌شده: ' + response.message,
                        icon: 'error',
                        confirmButtonText: 'باشه'
                    });
                }
            },
            error: function () {
                // نمایش پیام خطای شبکه با SweetAlert
                Swal.fire({
                    title: 'خطای ارتباط!',
                    text: 'خطای ارتباط با سرور. لطفاً دوباره تلاش کنید.',
                    icon: 'error',
                    confirmButtonText: 'باشه'
                });
            }
        });
    });

    $(document).off('click', '.actionReportMessage').on('click', '.actionReportMessage', function (e) {
        e.preventDefault();
        var messageId = $(this).data('messageid');
        console.log("در حال گزارش پیام با شناسه: " + messageId);

        // نمایش مودال برای گرفتن توضیحات گزارش
        Swal.fire({
            title: 'گزارش پیام',
            input: 'textarea',
            inputLabel: 'توضیحات گزارش',
            inputPlaceholder: 'لطفاً دلیل گزارش را توضیح دهید...',
            inputAttributes: {
                'aria-label': 'توضیحات گزارش',
                'dir':'rtl'
            },
            showCancelButton: true,
            confirmButtonText: 'ارسال گزارش',
            cancelButtonText: 'لغو',
            inputValidator: (value) => {
                if (!value || value.trim() === '') {
                    return 'توضیحات گزارش الزامی است!';
                }
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const description = result.value.trim();

                // ارسال گزارش به سرور با فیلدهای صحیح
                $.ajax({
                    url: `/api/chat/ReportMessage`,
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({ MessageId: messageId, FoulDesc: description }),
                    success: function (response) {
                        Swal.fire({
                            title: 'موفق!',
                            text: 'پیام با موفقیت گزارش شد.',
                            icon: 'success',
                            confirmButtonText: 'باشه',
                            timer: 1500,
                            showConfirmButton: false
                        });
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                        console.error('خطا در گزارش پیام:', textStatus, errorThrown);
                        Swal.fire({
                            title: 'خطا!',
                            text: 'خطا در گزارش پیام: ' + (jqXHR.responseJSON?.message || 'خطای نامشخص'),
                            icon: 'error',
                            confirmButtonText: 'باشه'
                        });
                    }
                });
            }
        });
    });


    $(document).off('click', '.actionPinMessage').on('click', '.actionPinMessage', function (e) {
        e.preventDefault();

        const $btn = $(this);
        let messageId = $btn.data('messageid') ?? $btn.data('message-id');
        messageId = parseInt(messageId);

        if (!messageId || messageId <= 0) {
            console.error("Invalid messageId for pin action:", messageId);
            return;
        }

        let currentIsPinned = $btn.data('is-pinned');
        if (typeof currentIsPinned === 'undefined') {
            const $messageBlock = $(`.message[data-message-id="${messageId}"]`);
            currentIsPinned = ($messageBlock.data('is-pinned') === true) || $messageBlock.hasClass('pinned');
        }

        currentIsPinned = (currentIsPinned === true || currentIsPinned === 'true' || currentIsPinned === 1);

        const confirmText = currentIsPinned
            ? 'آیا مطمئن هستید که می‌خواهید پین این پیام را لغو کنید؟'
            : 'آیا مطمئن هستید که می‌خواهید این پیام را پین کنید؟';

        Swal.fire({
            title: 'تأیید',
            text: confirmText,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'بله',
            cancelButtonText: 'خیر',
            reverseButtons: true
        }).then((result) => {
            if (!result.isConfirmed) return;

            const newIsPinned = !currentIsPinned;

            $.ajax({
                url: '/api/chat/PinMessage',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ MessageId: messageId, IsPinned: newIsPinned }),

                success: function () {
                    const $messageBlock = $(`.message[data-message-id="${messageId}"]`);

                    // Toggle pinned state on message
                    $messageBlock.toggleClass('pinned', newIsPinned);
                    $messageBlock.data('is-pinned', newIsPinned);

                    // --------✨ Update timing pin icon ✨--------
                    const $timing = $messageBlock.find(".timing");

                    if (newIsPinned) {
                        if ($timing.find(".pinmedmessageIcon").length === 0) {
                            $timing.append(
                                '<img src="/chatzy/assets/iconsax/pin-1.svg" class="pinmedmessageIcon" style="width:20px;">'
                            );
                        }
                    } else {
                        $timing.find(".pinmedmessageIcon").remove();
                    }
                    // --------------------------------------------------

                    // --------✨ Update pin button only ✨--------
                    $btn.data('is-pinned', newIsPinned);

                    const $textSpan = $btn.find(".pin-text");
                    if ($textSpan.length) {
                        $textSpan.text(newIsPinned ? "لغو سنجاق" : "سنجاق");
                    }

                    const $icon = $btn.find("img");
                    if ($icon.length) {
                        $icon.attr("src", newIsPinned
                            ? "/chatzy/assets/iconsax/pin-slash.svg"
                            : "/chatzy/assets/iconsax/pin-1.svg");
                    }
                    // --------------------------------------------------

                    Swal.fire({
                        title: 'موفق',
                        text: newIsPinned ? 'پیام با موفقیت پین شد.' : 'پین پیام حذف شد.',
                        icon: 'success',
                        timer: 1400,
                        showConfirmButton: false
                    });
                },

                error: function (jqXHR, textStatus, errorThrown) {
                    const serverMsg = jqXHR.responseJSON?.message || jqXHR.responseText || errorThrown || 'خطای نامشخص';
                    Swal.fire({
                        title: 'خطا',
                        text: 'خطا در عملیات پین/لغو پین: ' + serverMsg,
                        icon: 'error',
                        confirmButtonText: 'باشه'
                    });
                }
            });
        });
    });

    // کلیک بر روی پیام سنجاق شده در پنل سنجاق‌ها
    $(document).on('click', '.pinned-message-item', function () {
        const messageId = $(this).data('message-id');

        // بررسی کنید آیا پیام در حال حاضر در DOM موجود است
        const existingMessage = $(`#message-${messageId}`);

        if (existingMessage.length) {
            // اگر پیام موجود است، به آن اسکرول کنید
            scrollToPinnedMessage(messageId);
        } else {
            // اگر پیام موجود نیست، آن را بارگذاری کنید
            console.log(`Message ${messageId} not in DOM, loading around it...`);

            // لیسنر اسکرول را غیرفعال کنید
            window.chatApp.setScrollListenerActive(false);

            // بارگذاری 25 قدیمی + 25 جدید
            window.chatApp.triggerGetoldData(messageId, true);
        }
    });

    function scrollToPinnedMessage(messageId) {
        const targetElement = $(`#message-${messageId}`);
        if (!targetElement.length) return;

        const chatContent = $('#chat_content');
        const elementPosition = targetElement.offset().top - chatContent.offset().top + chatContent.scrollTop();

        // اسکرول با حاشیه
        chatContent.animate({
            scrollTop: elementPosition - 100
        }, 500);

        // Highlight پیام برای 2 ثانیه
        targetElement.addClass('highlight-message');
        setTimeout(() => {
            targetElement.removeClass('highlight-message');
            // فعال کردن مجدد لیسنر اسکرول
            window.chatApp.setScrollListenerActive(true);
        }, 2000);
    }

    // رویداد کلیک برای دکمه لغو پاسخ
    $(document).off('click', '#cancel-reply').on('click', '#cancel-reply', function () {
        resetInputState();
    });

    // تابع برای ریست کردن حالت ورودی
    function resetInputState() {
        console.log('resetInputState');

        // مخفی کردن کانتینر پاسخ و کانتینر انصراف از ویرایش
        $('#reply-to-container').hide();
        $('#cancel-edit-container').addClass('force-hide');
        // خالی کردن فیلدهای مخفی وضعیت
        $('#message-context-id').val('');
        $('#message-action-type').val('');

        // خالی کردن ورودی متن
        $('#message-input').val('');
        $('#message-input').attr('rows', 1);

        // پاک کردن کامل پیش‌نمایش فایل‌ها و شناسه‌های آنها
        $('#filePreviewContainer').removeClass('visible');
        $('#filePreviewContainer').empty();
        $('#uploadedFileIds').val('');
        $('#previousFileIds').val('');
        $('#deletUploadedFileIds').val('');

    }


    // رویداد کلیک روی اعلان پیام جدید و رفتن به جدید ترین پیام
    $(document).off('click', '#newMessagesNotice').on('click', '#newMessagesNotice', function () {
        const chatFinished = $('#chat-finished');
        chatFinished[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // 1. لیسنر اسکرول را به طور کامل غیرفعال کن
        window.chatApp.setScrollListenerActive(false); // 

        // 2. اسکرول را انجام بده
        chatFinished[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // 3. اعلان را مخفی کن
        $(this).hide().data('newCount', 0).text('');

        // 4. پرچم را تنظیم کن تا checkVisibleMessages غیرفعال بماند
        isMarkingAllMessagesAsRead = true;

        // 5. درخواست علامت‌گذاری همه پیام‌ها را به سرور بفرست
        const currentGroupIdForCheck = parseInt($('#current-group-id-hidden-input').val());
        const currentGroupTypeForCheck = $('#current-group-type-hidden-input').val();
        window.chatApp.markMarkAllMessagesAsRead(currentGroupIdForCheck, currentGroupTypeForCheck);

    });


    // ریسایز شدن صفحه و فراخوانی لیسنر برای مشاهده پیامها- جهت مریدیت خوانده نشده ها
    let resizeTimer;
    $(window).on('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            console.log("Window resized, running visibility check.");
            window.chatApp.triggerVisibilityCheck();
        }, 250); // با یک تأخیر 250 میلی‌ثانیه‌ای اجرا شود
    });

    //===============================================================
    //  =====>  اضافه کردن لیسنر برای فعال شدن تب مرورگر  <=====
    //===============================================================
    document.addEventListener('visibilitychange', function () {
        // اگر صفحه از حالت مخفی به حالت قابل مشاهده تغییر کرد
        if (!document.hidden) {
            console.log("Tab became visible, running visibility check.");
            // یک تأخیر کوتاه برای اطمینان از رندر مجدد صفحه
            setTimeout(function () {
                window.chatApp.triggerVisibilityCheck();
            }, 250);
        }
    });

    // جمع آوری ایدی فایلهای ارسالی که کاربر بارگذاری کرده و از سمت سرور ایدی دریافت شده
    function collectServerIdsFromContainer(containerSelector) {

        const hiddenInput = $(containerSelector);
        const value = hiddenInput.val();

        if (!value || value.trim() === "") return [];

        return value
            .split(',')
            .map(id => parseInt(id))
            .filter(id => !isNaN(id));

    }

    $(document).on('click', '.exit-tab-btn', function () {
        console.log("Announcing user presence to the main API...");
        $.post("/account/logout", function (response) {
            // پاسخ سرور
            console.log("خروج با موفقیت انجام شد:", response);
            // می‌توانید صفحه را به آدرس دیگری هدایت کنید یا کار دیگری انجام دهید
            window.location.href = "/"; // مثلاً هدایت به صفحه اصلی
        }).fail(function (error) {
            console.error("خطا در خروج:", error);
        });
    });


    /**
     * وقتی کاربر در ورودی اینتر را زد ارسال پیام فراخوانی شود
     * و اگر اینتر بهمراه کنترل بود به خط بعدی برود
     */

    // تابع برای تنظیم پویای ویژگی rows
    function adjustTextareaRows($textarea) {
        const text = $textarea.val();
        const lineCount = (text.match(/\n/g) || []).length + 1; // تعداد خطوط
        const maxRows = 5; // حداکثر تعداد سطرها
        const newRows = Math.min(lineCount, maxRows); // محدود به 5 سطر
        $textarea.attr('rows', newRows);
        console.log('Line count:', lineCount, 'New rows:', newRows);
    }

    // تابع برای تشخیص دستگاه موبایل یا تبلت
    function isMobileOrTablet() {
        return window.innerWidth < 768;
    }

    // مدیریت فشردن دکمه کنترل  و اینتر
    $(document).off('keydown', '#message-input').on('keydown', '#message-input', function (event) {
        console.log('Keydown event fired. Key:', event.key, 'Ctrl:', event.ctrlKey, 'Value before:', $(this).val());
        if (event.key === 'Enter') {
            // اگر کنترل با اینتر بود
            if (event.ctrlKey || event.shiftKey) {
                console.log('Ctrl + Enter or Shift + Enter: Adding new line');
                const $textarea = $(this);
                const currentText = $textarea.val();
                const cursorPos = $textarea[0].selectionStart;
                const newText = currentText.substring(0, cursorPos) + '\n' + currentText.substring(cursorPos);
                $textarea.val(newText);
                $textarea[0].selectionStart = $textarea[0].selectionEnd = cursorPos + 1;
                console.log('Value after:', $textarea.val());
                adjustTextareaRows($textarea); // تنظیم rows بعد از افزودن خط جدید
                return;
            } else { // اگر فقط اینتر بود
                if (isMobileOrTablet()) {
                    console.log('Mobile/Tablet: Enter adds new line');
                    const $textarea = $(this);
                    const currentText = $textarea.val();
                    const cursorPos = $textarea[0].selectionStart;
                    const newText = currentText.substring(0, cursorPos) + '\n' + currentText.substring(cursorPos);
                    $textarea.val(newText);
                    $textarea[0].selectionStart = $textarea[0].selectionEnd = cursorPos ;
                    adjustTextareaRows($textarea);
                    return;
                } else {
                    console.log('Desktop: Enter submits');
                    event.preventDefault();
                    event.stopPropagation();
                    const sendButton = $('#send-message-button');
                    console.log('Send button element:', sendButton.length ? sendButton : 'Not found');
                    if (sendButton.length) {
                        sendButton.trigger('click');
                    } else {
                        console.error('Send button not found!');
                    }
                }
            }
        }
    });

    // رویداد input برای تنظیم rows و تایپ
    $(document).off('input', '#message-input').on('input', '#message-input', function (event) {
        console.log('Input event fired. InputType:', event.originalEvent?.inputType);
        adjustTextareaRows($(this)); // تنظیم rows در هر تغییر
        if (event.originalEvent?.inputType === 'insertLineBreak') {
            console.log('Input event ignored for line break');
            return;
        }
        const groupId = parseInt($('#current-group-id-hidden-input').val());
        const groupType = $('#current-group-type-hidden-input').val();
        if (groupId > 0) {
            window.chatApp.sendTyping(groupId, groupType);
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                window.chatApp.stopTyping(groupId, groupType);
            }, TYPING_TIMEOUT);
        }
    });

    
});