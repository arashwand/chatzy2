$(document).ready(function () {
    // رویداد کلیک را به صورت delegation برای المان‌های .btn-download-file تعریف می‌کنیم.
    // این روش برای المان‌هایی که بعداً به صفحه اضافه می‌شوند نیز کار می‌کند.
$(document).on('click', '.download-icon', async function (e) {
    e.stopPropagation(); // جلوگیری از اینکه کلیک به span والد منتقل شود
    console.log('آیکون دانلود کلیک شد!');

    const $icon = $(this);
    const $button = $icon.closest('.btn-download-file'); // پیدا کردن span والد

    // دریافت fileId از data attribute والد
    const fileId = $button.data('file-id');
    const oroginalFileName = $button.data('file-originalname');
        console.log('File ID:', fileId);

        if (!fileId) {
            console.error('File ID پیدا نشد.');
            return;
        }

    const $spinnerIcon = $button.find('.spinner-icon'); // پیدا کردن اسپینر همزاد
        const apiUrl = '/api/chat/downloadFileById';

        // نمایش اسپینر و پنهان کردن آیکون دانلود
    $icon.hide();
        $spinnerIcon.show();

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ FileId: fileId })
            });

            if (!response.ok) {
                throw new Error(`خطای HTTP: ${response.status}`);
            }

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = blobUrl;

            // دریافت نام فایل از هدر Content-Disposition سرور
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `file-${fileId}`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch && filenameMatch[1]) {
                    filename = filenameMatch[1];
                }
            }

            if (oroginalFileName) {
                filename = oroginalFileName;
            }

            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(blobUrl);

        } catch (error) {
            console.error('مشکل در دانلود فایل:', error);
            alert('خطا در دانلود فایل. لطفاً دوباره تلاش کنید.');
        } finally {
            // بازگرداندن آیکون‌ها به حالت اولیه
            $spinnerIcon.hide();
        $icon.show();
        }
    });
});