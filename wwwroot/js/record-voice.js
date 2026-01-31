$(document).ready(function () {

    window.isRecording = false;
    window.isProcessing = false;
    window.mediaRecorder;
    window.audioChunks = [];
    window.recordingTimerInterval = null;
    window.pendingVoiceFileId = null;
    window.pendingVoiceUrl = null; // برای پخش پیش‌نمایش
    window.pendingVoiceAudioElement = null; // برای کنترل پخش
    window.currentMimeType = 'audio/webm'; // متغیر جدید برای ذخیره فرمت پشتیبانی شده
    //let isAudioProcessing = false;
    //let isAjaxProcessing = false;
    // ======================================================================
    //             VOICE RECORDING EVENT HANDLERS
    // ======================================================================


    // تابع اصلی برای مدیریت نمایش UI در حالت‌های مختلف
    window.updateChatInputUI = function(state, data = {}) {
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
                    <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="#dc3545" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
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

    window.startRecording = function () {
        if (isRecording || isProcessing) return;

        // 1. بررسی پشتیبانی مرورگر از فرمت‌های مختلف
        if (MediaRecorder.isTypeSupported('audio/ogg')) {
            currentMimeType = 'audio/ogg';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            currentMimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            currentMimeType = 'audio/mp4';
        } else {
            alert('متاسفانه مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.');
            console.error('No supported audio formats for MediaRecorder found.');
            return;
        }

        // 2. درخواست دسترسی به میکروفون
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            isRecording = true;
            //$('.btn-record-voice i').removeClass('fa-microphone').addClass('fa-stop');
            window.changeIcon($('.btn-record-voice'), 'stop');

            window.updateChatInputUI('recording');

            let seconds = 0;
            const timerSpan = $('.recording-timer');
            recordingTimerInterval = setInterval(() => {
                seconds++;
                const min = Math.floor(seconds / 60);
                const sec = seconds % 60;
                if (timerSpan.length) {
                    timerSpan.text(`${min}:${sec.toString().padStart(2, '0')}`);
                }
            }, 1000);

            audioChunks = [];

            // 3. ایجاد MediaRecorder با استفاده از فرمت پشتیبانی شده
            try {
                mediaRecorder = new MediaRecorder(stream, { mimeType: currentMimeType });
                mediaRecorder.start();
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    stream.getTracks().forEach(track => track.stop());
                    window.uploadVoiceFile();
                };
            } catch (err) {
                console.error("خطا در ایجاد MediaRecorder:", err);
                alert("خطا در راه‌اندازی ضبط صدا.");
                isRecording = false; // اطمینان از ریست شدن حالت ضبط
                stream.getTracks().forEach(track => track.stop());
                window.updateChatInputUI('default');
                window.cleanupVoiceState();
            }

        }).catch(err => {
            console.error("خطا در دسترسی به میکروفون:", err);
            alert(`خطا در دسترسی به میکروفون: ${err.name} - ${err.message}`);
            isRecording = false;
            window.updateChatInputUI('default');
        });
    }

    // تابع stopRecording
    window.stopRecording = function () {
        if (!isRecording) return;
        isRecording = false;
        isProcessing = true;
        window.clearInterval(recordingTimerInterval);
        //$('.btn-record-voice i').removeClass('fa-stop').addClass('fa-microphone');
        window.changeIcon($('.btn-record-voice'), 'microphone');
        window.updateChatInputUI('processing');
        // بررسی وجود mediaRecorder قبل از فراخوانی stop
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        } else {
            console.warn('MediaRecorder در حالت ضبط نبود. در حال ریست وضعیت.');
            window.cleanupVoiceState();
        }
    }

    //بارگذاری فایل صدای ضبط شده
    window.uploadVoiceFile = function () {
        if (audioChunks.length === 0) {
            console.warn('هیچ داده صوتی برای آپلود وجود ندارد.');
            window.cleanupVoiceState();
            return;
        }

        const voiceBlob = new Blob(audioChunks, { type: currentMimeType });
        pendingVoiceUrl = URL.createObjectURL(voiceBlob); // Create blob URL immediately for local use

        // Promise for decoding audio duration
        const decodePromise = new Promise((resolve, reject) => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const fileReader = new FileReader();
            fileReader.onload = () => {
                audioContext.decodeAudioData(fileReader.result)
                    .then(buffer => {
                        const duration = buffer.duration;
                        const min = Math.floor(duration / 60);
                        const sec = Math.floor(duration % 60);
                        const durationFormatted = `${min}:${sec.toString().padStart(2, '0')}`;
                        resolve({ duration, durationFormatted });
                    })
                    .catch(err => reject(err));
            };
            fileReader.onerror = () => reject('FileReader error');
            fileReader.readAsArrayBuffer(voiceBlob);
        });

        // Promise for uploading the file
        const uploadPromise = new Promise((resolve, reject) => {
            const fileExtension = currentMimeType.split('/')[1];
            const formData = new FormData();
            formData.append('file', new File([voiceBlob], `voice-${Date.now()}.${fileExtension}`));

            $.ajax({
                url: '/Home/UploadFiles',
                type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: function (response) {
                    if (response && response.success) {
                        resolve({ fileId: response.fileId });
                    } else {
                        reject(response ? response.message : 'پاسخ نامعتبر از سرور');
                    }
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    reject(`خطای ارتباطی: ${textStatus}`);
                }
            });
        });

        // Wait for both operations to complete
        Promise.all([decodePromise, uploadPromise])
            .then(([audioData, uploadData]) => {
                console.log(`موفق: زمان محاسبه شد (${audioData.durationFormatted}), فایل آپلود شد (ID: ${uploadData.fileId})`);

                pendingVoiceFileId = uploadData.fileId;
                pendingVoiceAudioElement = new Audio(pendingVoiceUrl);
                window.addFileIdToHiddenInput(uploadData.fileId, '#uploadedFileIds');

                isProcessing = false;
                window.updateChatInputUI('preview', {
                    duration: audioData.duration,
                    durationFormatted: audioData.durationFormatted
                });
            })
            .catch(error => {
                console.error("خطا در پردازش فایل صوتی:", error);
                alert(`خطا در پردازش فایل صوتی: ${error}`);
                window.cleanupVoiceState(true, false); // Clean up, including potential server file
            });
    }


    /**
     * ریست متغیر های ایجاد شده در هنگام ضبط صده
     * @param {any} deleteFromServer : این متغیر مشخص میکند ایا فایل هم حذف شود یا خیر
     */
    window.cleanupVoiceState = function(deleteFromServer = false, voiceWasSent = false) {
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
        isAudioProcessing = false;
        isAjaxProcessing = false;
        if (recordingTimerInterval) window.clearInterval(recordingTimerInterval);

        // Revoke the URL ONLY if the voice was NOT sent.
        // If it was sent, the blob URL is now in the chat UI.
        if (pendingVoiceUrl && !voiceWasSent) {
            URL.revokeObjectURL(pendingVoiceUrl);
        }

        pendingVoiceFileId = null;
        pendingVoiceUrl = null;
        pendingVoiceAudioElement = null;

        // بازگشت به حالت پیش‌فرض
        window.updateChatInputUI('default');
        //$('.btn-record-voice i').removeClass('fa-stop').addClass('fa-microphone');
        window.changeIcon($('.btn-record-voice'), 'microphone');
    }


    window.addFileIdToHiddenInput = function (serverFileId, containerSelector) {
        const hiddenInput = $(containerSelector);
        let currentIds = hiddenInput.val() ? hiddenInput.val().split(',') : [];
        if (!currentIds.includes(serverFileId)) {
            currentIds.push(serverFileId);
            hiddenInput.val(currentIds.join(','));
        }
    }


    // --- مدیریت رویدادها با Event Delegation ---

    // کلیک روی دکمه میکروفون/توقف
    $(document).on('click', '.btn-record-voice', function () {
        if (isRecording) {
            window.stopRecording();
        } else {
            window.startRecording();
        }
    });

    $(document).on('click', '.stop-recording-btn', function () {
        window.stopRecording();
    });

    // کلیک روی دکمه حذف پیش‌نمایش
    $(document).on('click', '.delete-btn', function () {
        window.cleanupVoiceState(true, false); // true یعنی از سرور هم حذف کن
    });

    // تابع برای تغییر آیکون
    window.changeIcon = function (button, iconType) {
        if (iconType === 'stop') {
            button.html(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#fff">
                <g clip-path="url(#clip0_4418_4367)">
                <path opacity="0.4" d="M11.9702 22C17.4931 22 21.9702 17.5228 21.9702 12C21.9702 6.47715 17.4931 2 11.9702 2C6.44737 2 1.97021 6.47715 1.97021 12C1.97021 17.5228 6.44737 22 11.9702 22Z" fill="white" style="fill: var(--fillg);"/>
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
    window.setInterval(() => {
        if (pendingVoiceAudioElement && !pendingVoiceAudioElement.paused) {
            const timeline = $('.voice-timeline');
            if (timeline.length) {
                timeline.attr('max', pendingVoiceAudioElement.duration);
                timeline.val(pendingVoiceAudioElement.currentTime);
            }
        }
    }, 100); // هر 100 میلی‌ثانیه چک کن


});