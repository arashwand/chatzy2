// --- START OF FILE modal-lightbox.js (نسخه اصلاح‌شده) ---

$(document).ready(function () {
    let currentIndex = 0;
    let imageList = [];
    let activeImage = 'A';
    let touchStartX = 0;

    // --- افزودن Listener برای خالی کردن مودال هنگام بسته شدن ---
    $('#imageLightboxModal').on('hidden.bs.modal', function () {
        $('#imageA').attr('src', '');
        $('#imageB').attr('src', '');
        $('#imageFileName').text('');
        activeImage = 'A';
        $('#imageA, #imageB').removeClass('active slide-in-left slide-in-right slide-center')
            .css({ 'opacity': 1, 'transform': 'none' });
    });

    $(document).on('click', '.chat-thumbnail', async function () {
        const $group = $(this).closest('.image-group');
        let $thumbs;
        if ($group.length) {
            $thumbs = $group.find('.chat-thumbnail');
        } else {
            // For optimistic messages or single images, treat as a single image group
            $thumbs = $(this);
        }
        imageList = $thumbs.map(function () {
            return {
                id: $(this).closest('.file-attachment-item').data('file-id'),
                filename: $(this).data('original-filename')
            };
        }).get();
        currentIndex = $thumbs.index(this);

        const modal = new bootstrap.Modal(document.getElementById('imageLightboxModal'));
        modal.show();
        await showImage(currentIndex, 'none');
    });

    // نمایش تصویر با اسلاید
    async function showImage(index, direction = 'none') {
        if (index < 0 || index >= imageList.length) return;

        const image = imageList[index];
        $('#imageFileName').text(image.filename);
        $('#imageLoader').show();

        const active = activeImage === 'A' ? $('#imageA') : $('#imageB');
        const next = activeImage === 'A' ? $('#imageB') : $('#imageA');

        try {
            // *** تغییر کلیدی: درخواست fetch به آدرس صحیح API شما ارسال می‌شود ***
            // این درخواست از نوع GET است و توسط Service Worker رهگیری خواهد شد.
            const response = await fetch(`/api/chat/downloadFileById/?fileId=${image.id}`);

            if (!response.ok) throw new Error('Failed to load image');

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            next.attr('src', blobUrl)
                .removeClass('active slide-in-left slide-in-right slide-center')
                .css('opacity', 1);

            if (direction === 'left') {
                next.addClass('slide-in-left');
            } else if (direction === 'right') {
                next.addClass('slide-in-right');
            }

            requestAnimationFrame(() => {
                $('#imageLoader').hide();
                active.removeClass('slide-center').css('opacity', 1);
                if (direction === 'left') {
                    active.css('transform', 'translateX(100%)').css('opacity', 0);
                } else if (direction === 'right') {
                    active.css('transform', 'translateX(-100%)').css('opacity', 0);
                }
                next.removeClass('slide-in-left slide-in-right').addClass('slide-center active');
            });

            activeImage = activeImage === 'A' ? 'B' : 'A';
            $('.btn-download-image-file')
                .data('file-id', image.id)
                .data('file-originalname', image.filename);

        } catch (err) {
            console.error('Error loading image:', err);
            $('#imageLoader').hide();
        }
    }


    // دکمه قبلی و بعدی 
    $('#prevImage').on('click', async function () {
        if (currentIndex > 0) {
            currentIndex--;
            await showImage(currentIndex, 'left');
        }
    });
    $('#nextImage').on('click', async function () {
        if (currentIndex < imageList.length - 1) {
            currentIndex++;
            await showImage(currentIndex, 'right');
        }
    });

    // پشتیبانی از swipe 
    $('#imageLightboxModal').on('touchstart', e => {
        touchStartX = e.originalEvent.touches[0].clientX;
    });
    $('#imageLightboxModal').on('touchend', async e => {
        const touchEndX = e.originalEvent.changedTouches[0].clientX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 60) {
            if (diff > 0 && currentIndex < imageList.length - 1) {
                currentIndex++;
                await showImage(currentIndex, 'right');
            } else if (diff < 0 && currentIndex > 0) {
                currentIndex--;
                await showImage(currentIndex, 'left');
            }
        }
    });

    // دانلود فایل (این بخش را نیز می‌توان به GET تغییر داد)
    $(document).on('click', '.btn-download-image-file', async function (e) {
        e.stopPropagation();
        const $btn = $(this);
        const fileId = $btn.data('file-id');
        const fileName = $btn.data('file-originalname');

        const downloadUrl = `/api/chat/downloadFileById/?fileId=${fileId}`;
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName || `file-${fileId}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    });

    /**میتوانیم یک  دکمه را در دسترس کاربر قرار دهیم تا این تابع را فراخوانی کند و کش تصاویر را خالی کند*/
    async function clearImageCache() {
        if ('caches' in window) {
            try {
                await caches.delete('image-lightbox-cache-v1'); // نام دقیق کش را وارد کنید
                alert('حافظه پنهان با موفقیت پاک شد. برای اعمال تغییرات، صفحه را مجددا بارگیری کنید.');
            } catch (error) {
                console.error('خطا در پاک‌سازی کش:', error);
                alert('خطایی در پاک‌سازی حافظه پنهان رخ داد.');
            }
        }
    }
});