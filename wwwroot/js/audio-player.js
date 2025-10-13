// ======================================================================
//          AUDIO PLAYER LOGIC (File: audio-player.js) - DIRECT BINDING TEST
// ======================================================================

$(document).ready(function () {

    // کدهای SVG برای آیکون‌های Play و Pause
    const SVG_PLAY = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#000"><g clip-path="url(#clip0_4418_9259)"><path d="M4 12.0004V8.44038C4 4.02038 7.13 2.21038 10.96 4.42038L14.05 6.20038L17.14 7.98038C20.97 10.1904 20.97 13.8104 17.14 16.0204L14.05 17.8004L10.96 19.5804C7.13 21.7904 4 19.9804 4 15.5604V12.0004Z" stroke="#fff" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"></path></g><defs><clipPath id="clip0_4418_9259"><rect width="24" height="24" fill="white"></rect></clipPath></defs></svg>`;
    const SVG_PAUSE = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#000">
        <g clip-path="url(#clip0_4418_8051)">
        <path d="M11.97 2C6.44997 2 1.96997 6.48 1.96997 12C1.96997 17.52 6.44997 22 11.97 22C17.49 22 21.97 17.52 21.97 12C21.97 6.48 17.5 2 11.97 2ZM10.72 15.03C10.72 15.51 10.52 15.7 10.01 15.7H8.70997C8.19997 15.7 7.99997 15.51 7.99997 15.03V8.97C7.99997 8.49 8.19997 8.3 8.70997 8.3H9.99997C10.51 8.3 10.71 8.49 10.71 8.97V15.03H10.72ZM16 15.03C16 15.51 15.8 15.7 15.29 15.7H14C13.49 15.7 13.29 15.51 13.29 15.03V8.97C13.29 8.49 13.49 8.3 14 8.3H15.29C15.8 8.3 16 8.49 16 8.97V15.03Z" fill="white" style="fill: var(--fillg);"/>
        </g>
        <defs>
        <clipPath id="clip0_4418_8051">
        <rect width="24" height="24" fill="white"/>
        </clipPath>
        </defs>
        </svg>
            `;

    // این تابع اکنون یک پارامتر برای عنصر صدا می‌گیرد
    function setupAudioEventListeners(audio) {
        if (!audio) return;

        // اگر این عنصر قبلاً شنونده داشته، از اتصال مجدد جلوگیری کن
        if ($(audio).data('events-attached')) {
            return;
        }

        console.log(`%cAttaching new event listeners to: ${audio.src}`, 'color: blue; font-weight: bold;');

        const $container = $(audio).closest('.audio-player-container');
        const $btn = $container.find('.voice-playback-btn'); // دکمه اصلی
        const $durationDisplay = $container.find('.voice-duration-display');
        const $progress = $container.find('.voice-timeline-progress');
        const $handle = $container.find('.voice-timeline-handle');

        // تغییر آیکون‌ها با استفاده از SVG در **خطوط ۴۴، ۴۸، ۵۲**
        $(audio).on('play', function () {
            console.log('Direct-bind "play" event fired.');
            $btn.html(SVG_PAUSE); // **خط ۴۴: جایگزینی آیکون با Pause SVG**
        });

        $(audio).on('pause', function () {
            console.log('Direct-bind "pause" event fired.');
            $btn.html(SVG_PLAY); // **خط ۴۸: جایگزینی آیکون با Play SVG**
        });

        $(audio).on('ended', function () {
            console.log('Direct-bind "ended" event fired.');
            $btn.html(SVG_PLAY); // **خط ۵۲: جایگزینی آیکون با Play SVG**
            this.currentTime = 0;
        });

        $(audio).on('timeupdate', function () {
            // برای جلوگیری از لاگ‌های زیاد، این خط را کامنت می‌کنیم مگر برای دیباگ
            // console.log('Direct-bind "timeupdate" fired.');

            $durationDisplay.text(formatAudioTime(this.currentTime)); // **خط ۵۷: به‌روزرسانی زمان پخش**

            if (isFinite(this.duration)) {
                const progress = (this.currentTime / this.duration) * 100;
                $progress.css('width', `${progress}%`);
                $handle.css('left', `${progress}%`);
            }
        });

        // علامت‌گذاری عنصر برای جلوگیری از اتصال مجدد
        $(audio).data('events-attached', true);
    }

    // رویداد کلیک اصلی
    $(document).on('click', '.voice-playback-btn', function (e) {
        e.stopPropagation();

        const $container = $(this).closest('.audio-player-container');
        const audio = $container.find('audio').get(0);

        if (!audio) return;

        // --- بخش کلیدی: اتصال مستقیم رویدادها در لحظه نیاز ---
        setupAudioEventListeners(audio);
        // ----------------------------------------------------

        if (audio.paused) {
            // توقف سایر پلیرها
            $('.audio-player-container audio').each(function () {
                if (this !== audio && !this.paused) { this.pause(); }
            });
            audio.play().catch(error => console.error("Playback failed:", error));
        } else {
            audio.pause();
        }
    });

    // رویداد کلیک روی تایم‌لاین (این می‌تواند به صورت قبلی باقی بماند)
    $(document).on('click', '.voice-timeline-container', function (e) {
        e.stopPropagation();
        const $timeline = $(this);
        const audio = $timeline.closest('.audio-player-container').find('audio').get(0);
        if (!audio || !isFinite(audio.duration)) return;
        const clickX = e.pageX - $timeline.offset().left;
        const newTime = (clickX / $timeline.width()) * audio.duration;
        audio.currentTime = newTime;
    });

    // تابع کمکی برای فرمت زمان
    if (typeof formatAudioTime === 'undefined') {
        window.formatAudioTime = function (time) {
            if (isNaN(time) || !isFinite(time)) return "0:00";
            const minutes = Math.floor(time / 60);
            const seconds = Math.floor(time % 60);
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }


    // کدهای SVG برای آیکون‌های Download و Spinner
    const SVG_DOWNLOAD = `<img src="/chatzy/assets/iconsax/download.svg" class="download-icon" style="cursor:pointer; width: 24px; height: 24px;" alt="download">`;
    const SVG_SPINNER = `<img src="/chatzy/assets/iconsax/spinner.svg" class="spinner-icon" style="display: none; width: 24px; height: 24px;" alt="loading">`;


    const downloader = new FileDownloader('/api/chat/downloadFileById');

    $(document).on('click', '.voice-download-btn', async function (e) {
        e.stopPropagation();
        const $btn = $(this);

        const fileId = $btn.data('file-id');
        if (!fileId) {
            console.error("No file-id found on the download button.");
            alert("شناسه فایل پیدا نشد.");
            return;
        }

        // جستجو بر اساس کلاس‌های CSS شما (که شامل کلاس voice-download-btn نیست)
        const $downloadIcon = $btn.find('.download-icon');
        const $spinnerIcon = $btn.find('.spinner-icon');

        if ($btn.hasClass('loading')) return;

        $btn.addClass('loading');
        $downloadIcon.hide(); // **خط ۹۵: پنهان کردن آیکون دانلود SVG**
        $spinnerIcon.show(); // **خط ۹۶: نمایش اسپینر SVG**


        try {
            const fileData = await downloader.downloadFile(fileId);

            // **خطوط ۱۰۳-۱۱۱: ساختار جدید HTML با استفاده از SVG_PLAY**
            const playerHtml = `
            <button class="voice-playback-btn">${SVG_PLAY}</button> 
            <div class="voice-timeline-container">
                <div class="voice-timeline-bg"></div>
                <div class="voice-timeline-progress"></div>
                <div class="voice-timeline-handle"></div>
            </div>
            <div class="voice-duration-display">0:00</div>
            <audio class="d-none" src="${fileData.blobUrl}" preload="metadata"></audio>
        `;

            const $container = $btn.closest('.audio-player-container');
            $container.html(playerHtml);

            console.log("File downloaded:", fileData.fileName);

            const newAudio = $container.find('audio').get(0);
            if (newAudio) {
                // **خطوط ۱۱۴-۱۲۸: محاسبه و نمایش مدت زمان با AudioContext**
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                fetch(fileData.blobUrl)
                    .then(res => res.arrayBuffer())
                    .then(buf => audioContext.decodeAudioData(buf))
                    .then(audioBuffer => {
                        $container.find('.voice-duration-display').text(formatAudioTime(audioBuffer.duration));
                    })
                    .catch(err => {
                        console.error("Error decoding audio data:", err);
                        $container.find('.voice-duration-display').text("0:00");
                    });
            }

        } catch (error) {
            alert(error.message);

            $btn.removeClass('loading');
            $downloadIcon.show(); // **خط ۱۱۷: نمایش مجدد آیکون دانلود SVG**
            $spinnerIcon.hide(); // **خط ۱۱۸: پنهان کردن اسپینر SVG**
        }
    });

});

class FileDownloader {
    // کد کلاس FileDownloader بدون تغییر باقی می‌ماند
    constructor(endpoint) {
        this.endpoint = endpoint;
    }

    async downloadFile(fileId) {
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ FileId: fileId })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Download failed with status ${response.status}: ${errorText}`);
            }

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            return {
                blobUrl: blobUrl,
                fileName: response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'downloaded-file'
            };
        } catch (error) {
            console.error("Error downloading file:", error);
            throw new Error("خطا در دانلود فایل. لطفاً دوباره تلاش کنید.");
        }
    }
}