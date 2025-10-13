
$(document).ready(function () {
    let currentIndex = 0;
    let imageList = [];
    let activeImage = 'A'; // تعیین اینکه الان A فعال است یا B
    let touchStartX = 0;

    // کلیک روی تصویر
    $(document).on('click', '.chat-thumbnail', async function () {
        const $group = $(this).closest('.image-group');
        const $thumbs = $group.find('.chat-thumbnail');
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
            const response = await fetch('/api/chat/downloadFileById', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ FileId: image.id })
            });
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

            // فعال‌سازی انیمیشن
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
            $('.btn-download-file')
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

    // پشتیبانی از swipe (موبایل)
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

    // دانلود فایل
    $(document).on('click', '.btn-download-file', async function (e) {
        e.stopPropagation();
        const $btn = $(this);
        const fileId = $btn.data('file-id');
        const fileName = $btn.data('file-originalname');

        const $icon = $btn.find('i');
        const $spinner = $btn.find('.spinner-icon');
        $icon.hide();
        $spinner.show();

        try {
            const res = await fetch('/api/chat/downloadFileById', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ FileId: fileId })
            });
            if (!res.ok) throw new Error();
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName || `file-${fileId}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            alert('خطا در دانلود فایل');
        } finally {
            $spinner.hide();
            $icon.show();
        }
    });
});

