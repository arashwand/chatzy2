// ======================================================================
//          AUDIO PLAYER LOGIC (File: audio-player.js) - DIRECT BINDING TEST
// ======================================================================

$(document).ready(function () {

    // این تابع اکنون یک پارامتر برای عنصر صدا می‌گیرد
    function setupAudioEventListeners(audio) {
        if (!audio) return;

        // اگر این عنصر قبلاً شنونده داشته، از اتصال مجدد جلوگیری کن
        if ($(audio).data('events-attached')) {
            return;
        }

        console.log(`%cAttaching new event listeners to: ${audio.src}`, 'color: blue; font-weight: bold;');

        const $container = $(audio).closest('.audio-player-container');
        const $btnIcon = $container.find('.voice-playback-btn i');
        const $durationDisplay = $container.find('.voice-duration-display');
        const $progress = $container.find('.voice-timeline-progress');
        const $handle = $container.find('.voice-timeline-handle');

        $(audio).on('play', function () {
            console.log('Direct-bind "play" event fired.');
            $btnIcon.removeClass('fa-play').addClass('fa-pause');
        });

        $(audio).on('pause', function () {
            console.log('Direct-bind "pause" event fired.');
            $btnIcon.removeClass('fa-pause').addClass('fa-play');
        });

        $(audio).on('ended', function () {
            console.log('Direct-bind "ended" event fired.');
            $btnIcon.removeClass('fa-pause').addClass('fa-play');
            this.currentTime = 0;
        });

        $(audio).on('timeupdate', function () {
            // برای جلوگیری از لاگ‌های زیاد، این خط را کامنت می‌کنیم مگر برای دیباگ
            // console.log('Direct-bind "timeupdate" fired.');

            $durationDisplay.text(formatAudioTime(this.currentTime));

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

        if ($btn.hasClass('loading')) return;

        $btn.addClass('loading');
        $btn.find('.fa-download').hide();
        $btn.find('.fa-spinner').show();

        try {
            const fileData = await downloader.downloadFile(fileId);

            const playerHtml = `
            <button class="voice-playback-btn"><i class="fa fa-play"></i></button>
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

            // می‌توانید نام فایل را هم اینجا ذخیره کنید
            console.log("File downloaded:", fileData.fileName);

            const newAudio = $container.find('audio').get(0);
            if (newAudio) {
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
            $btn.find('.fa-download').show();
            $btn.find('.fa-spinner').hide();
        }
    });

});

class FileDownloader {
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