$(document).ready(function () {

    // =========================================================================
    //                          File Upload Management
    // =========================================================================

    // A helper function to manage the visibility of the preview container
    function checkPreviewContainerVisibility() {
        const container = $('#filePreviewContainer');
        if (container.children().length > 0) {
            if (!container.hasClass('visible')) {
                container.addClass('visible');
            }
        } else {
            container.removeClass('visible');
        }
    }

    // تابع کمکی برای ساخت پیش‌نمایش فایل‌های از قبل آپلود شده (با ظاهری یکسان با آپلود جدید)
    function addExistingFileToPreview(fileData) {
        const elementId = 'file-' + fileData.messageFileId;
        let previewElement;
        const fileExtension = (fileData.originalFileName || fileData.fileName).split('.').pop().toLowerCase();

        // بررسی اینکه فایل تصویر است یا خیر
        if (window.chatApp.ALLOWED_IMAGES.includes(fileExtension)) {
            const baseUrl = $('#baseUrl').val() || '';
            const imageURL = baseUrl + (fileData.fileThumbPath || fileData.filePath);
            previewElement = `<img src="${imageURL}" class="file-thumbnail" alt="پیش‌نمایش">`;
        } else {
            // آیکون برای سایر فایل‌ها
            let icon = `<i class="iconsax" data-icon="document-text-1" aria-hidden="true"></i>`;
            previewElement = `<div class="file-icon">${icon}</div>`;
        }

        // ساخت HTML نهایی برای پیش‌نمایش
        // **نکته کلیدی**: ما یک data-attribute به نام data-is-existing="true" اضافه می‌کنیم
        // تا بعداً در هنگام حذف، بتوانیم بین فایل قدیمی و جدید تمایز قائل شویم.
        const previewHtml = `
        <div class="file-preview-item" id="${elementId}">
            <div class="file-info">
                ${previewElement}
                <div>
                    <div class="file-name" title="${fileData.originalFileName || fileData.fileName}">${fileData.originalFileName || fileData.fileName}</div>
                    <div class="file-details">
                        <span class="file-size">${formatFileSize(fileData.fileSize || 0)}</span>
                    </div>
                </div>
            </div>
            <div class="status-icon">
                <span class="action-btn remove-file-btn" 
                      data-server-id="${fileData.messageFileId}" 
                      data-is-existing="true" 
                      title="حذف فایل" 
                      style="display: inline-block;">
                      <img src="/chatzy/assets/iconsax/trash.svg" alt="t" />

                </span>
            </div>
        </div>`;

        $('#filePreviewContainer').append(previewHtml);
        checkPreviewContainerVisibility(); // بررسی نمایش کانتینر

        if (typeof init_iconsax === 'function') {
            init_iconsax();
        }
    }

    // Event listener for the file input.
    $(document).on('change', '#fileInput', function (event) {
        const files = event.target.files;
        if (!files.length) return;

        for (const file of files) {
            processFile(file);
        }
        $(this).val('');
    });

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    async function processFile(file, elementId = null) {
        if (!elementId) {
            elementId = 'file-' + Date.now() + Math.random().toString(36).substr(2, 9);
            addFileToPreviewList(file, elementId);
        }

        $('#' + elementId).data('fileObject', file);
        const fileExtension = file.name.split('.').pop().toLowerCase();
        updateFileStatus(elementId, "Preparing...", false, null, true);

        if (!window.chatApp || window.chatApp.ALLOWED_IMAGES.length === 0) {
            await window.chatApp.callAlloewExtentions();
        }

        if (window.chatApp.ALLOWED_IMAGES.includes(fileExtension)) {
            try {
                updateFileStatus(elementId, 'Compressing...', false, null, true);
                const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
                const compressedFile = await imageCompression(file, options);
                uploadFile(compressedFile, elementId, file.name);
            } catch (error) {
                updateFileStatus(elementId, 'Compression failed!', true);
            }
        } else if (window.chatApp.ALLOWED_DOCS.includes(fileExtension) || window.chatApp.ALLOWED_AUDIO.includes(fileExtension)) {
            uploadFile(file, elementId, file.name);
        } else {
            updateFileStatus(elementId, 'File type not allowed!', true);
        }
    }

    function uploadFile(file, elementId, originalFileName) {
        const formData = new FormData();
        formData.append('file', file, originalFileName);
        updateFileStatus(elementId, 'Uploading...', false, null, true);

        $.ajax({
            url: '/Home/UploadFiles',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function (response) {
                if (response.success) {
                    updateFileStatus(elementId, 'Success', false, response.fileId);
                    addFileIdToHiddenInput(response.fileId.toString(), '#uploadedFileIds');
                } else {
                    updateFileStatus(elementId, response.message || 'Server error', true);
                }
            },
            error: function (jqXHR) {
                const errorMessage = jqXHR.responseJSON?.message || 'Connection error';
                updateFileStatus(elementId, errorMessage, true);
            }
        });
    }

    function addFileToPreviewList(file, elementId) {
        let previewElement;
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const formattedSize = formatFileSize(file.size);

        if (window.chatApp && window.chatApp.ALLOWED_IMAGES.includes(fileExtension)) {
            const imageURL = URL.createObjectURL(file);
            previewElement = `<img src="${imageURL}" class="file-thumbnail" alt="Preview">`;
        } else {
            let icon = `<i class="iconsax" data-icon="document-text-1" aria-hidden="true"></i>`;
            previewElement = `<div class="file-icon">${icon}</div>`;
        }

        const previewHtml = `
            <div class="file-preview-item" id="${elementId}">
                <div class="file-info">
                    ${previewElement}
                    <div>
                        <div class="file-name" title="${file.name}">${file.name}</div>
                        <div class="file-details">
                            <span class="file-size">${formattedSize}</span>
                            <div class="status-text">
                                <div class="spinner"></div>
                                <span class="status-message">Waiting...</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="status-icon">
                    <span class="action-btn remove-file-btn" data-server-id="" title="Remove File">
                    <img src="/chatzy/assets/iconsax/trash.svg" alt="t">
                    </span>
                    <span class="action-btn retry-upload-btn" title="Retry">🔄</span>
                    <span class="action-btn cancel-upload-btn" title="Cancel">❌</span>
                </div>
            </div>`;

        $('#filePreviewContainer').append(previewHtml);
        checkPreviewContainerVisibility(); // Check visibility after adding

        if (typeof init_iconsax === 'function') {
            init_iconsax();
        }
    }

    function updateFileStatus(elementId, statusText, isError = false, serverFileId = null, inProgress = false) {
        const item = $('#' + elementId);
        item.find('.status-message').text(statusText);
        item.find('.spinner').toggle(inProgress);

        const removeButton = item.find('.remove-file-btn');
        const retryButton = item.find('.retry-upload-btn');
        const cancelButton = item.find('.cancel-upload-btn');

        removeButton.hide();
        retryButton.hide();
        cancelButton.hide();

        if (serverFileId) {
            removeButton.attr('data-server-id', serverFileId).show();
        } else if (isError) {
            retryButton.show();
            cancelButton.show();
        } else if(inProgress) {
            cancelButton.show();
        }
    }

    $(document).on('click', '.retry-upload-btn', function () {
        const item = $(this).closest('.file-preview-item');
        const fileObject = item.data('fileObject');
        if (fileObject) {
            processFile(fileObject, item.attr('id'));
        }
    });

    function handleRemoveFile(button) {
        const $button = $(button);
        const item = $button.closest('.file-preview-item');
        const serverIdToRemove = $button.data('server-id').toString();
        const isExistingFile = $button.data('is-existing') === true; // تشخیص فایل قدیمی

        // پاک کردن پیش‌نمایش از DOM
        const img = item.find('img.file-thumbnail');
        if (img.length && img.attr('src').startsWith('blob:')) {
            URL.revokeObjectURL(img.attr('src'));
        }

        item.addClass('removing');
        setTimeout(() => {
            item.remove();
            checkPreviewContainerVisibility();
        }, 400);

        // اگر فایلی برای حذف وجود داشت
        if (serverIdToRemove) {
            // اگر این یک فایل قدیمی از حالت ویرایش بود
            if (isExistingFile) {
                // شناسه آن را به لیست حذفی‌ها اضافه کن
                addFileIdToHiddenInput(serverIdToRemove, '#deletUploadedFileIds');
            }
            // اگر یک فایل جدید بود که در همین session آپلود شده
            else {
                // شناسه آن را از لیست آپلود شده‌ها حذف کن
                removeFileIdFromHiddenInput(serverIdToRemove, '#uploadedFileIds');

                // و درخواست حذف آن را به سرور بفرست
                $.ajax({
                    url: '/Home/DeleteFile',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({ fileId: serverIdToRemove }),
                    success: function (response) {
                        if (response.success) {
                            console.log('File successfully deleted from server.');
                        } else {
                            alert('Error deleting file from server: ' + response.message);
                        }
                    },
                    error: function () {
                        alert('Connection error while deleting file from server.');
                    }
                });
            }
        }
    }

    $(document).on('click', '.remove-file-btn', function () {
        handleRemoveFile(this);
    });

    $(document).on('click', '.cancel-upload-btn', function () {
        handleRemoveFile(this);
    });

    function addFileIdToHiddenInput(serverFileId, containerSelector) {
        const hiddenInput = $(containerSelector);
        let currentIds = hiddenInput.val() ? hiddenInput.val().split(',') : [];
        if (!currentIds.includes(serverFileId)) {
            currentIds.push(serverFileId);
            hiddenInput.val(currentIds.join(','));
        }
    }

    function removeFileIdFromHiddenInput(serverFileId, containerSelector) {
        const hiddenInput = $(containerSelector);
        let currentIds = hiddenInput.val() ? hiddenInput.val().split(',') : [];
        const newIds = currentIds.filter(id => id !== serverFileId);
        hiddenInput.val(newIds.join(','));
    }

    // actionEditMessage
    $(document).off('click', '.actionEditMessage').on('click', '.actionEditMessage', function (e) {
        e.preventDefault();

        const messageBlock = $(this).closest('.message');
        const messageId = messageBlock.data('message-id');
        const messageDetailsStr = messageBlock.attr('data-message-details');

        if (!messageDetailsStr) {
            alert('اطلاعات این پیام برای ویرایش یافت نشد.');
            return;
        }

        try {
            const messageDetails = JSON.parse(messageDetailsStr);
            const hasText = messageDetails.messageText && messageDetails.messageText.trim() !== '';
            const hasFiles = messageDetails.messageFiles && messageDetails.messageFiles.length > 0;

            // جلوگیری از ویرایش پیام صوتی ضبط شده
            if (!hasText && hasFiles) {
                if (messageDetails.messageFiles.some(f => (f.fileName || '').toLowerCase().endsWith('.webm'))) {
                    alert('امکان ویرایش پیام‌های صوتی ضبط شده وجود ندارد.');
                    return;
                }
            }

            resetInputState(); // پاک‌سازی فرم

            // تنظیم حالت ویرایش
            $('#message-action-type').val('edit');
            $('#message-context-id').val(messageId);
            $('#cancel-edit-container').removeClass('force-hide');

            // پر کردن متن پیام
            const textarea = $('#message-input');
            const text = (messageDetails.messageText || '').replace(/<br\s*\/?>/gi, '\n');
            textarea.val(text).trigger('input');
            textarea.focus();

            // **استفاده از توابع جدید برای نمایش فایل‌ها**
            if (hasFiles) {
                const previousFileIds = messageDetails.messageFiles.map(f => f.messageFileId);

                // برای هر فایل، از تابع جدید در fileManagement.js استفاده کن
                messageDetails.messageFiles.forEach(file => {
                    // **این تابع باید در scope گلوبال در دسترس باشد**
                    if (typeof addExistingFileToPreview === 'function') {
                        addExistingFileToPreview(file);
                    } else {
                        console.error('Function addExistingFileToPreview not found!');
                    }
                });

                // ذخیره شناسه‌ها در فیلد مخفی
                $('#previousFileIds').val(previousFileIds.join(','));
            }

        } catch (err) {
            console.error("خطا در خواندن اطلاعات پیام برای ویرایش.", err);
            alert('خطا در پردازش اطلاعات پیام.');
        }
    });

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
        $('#filePreviewContainer').empty();
        $('#uploadedFileIds').val('');
        $('#previousFileIds').val('');
        $('#deletUploadedFileIds').val('');

    }

    // =========================================================================
    //                          File Download Management
    // =========================================================================
    $(document).on('click', '.download-icon', async function (e) {
        e.stopPropagation();
        const $icon = $(this);
        const $button = $icon.closest('.btn-download-file');
        const fileId = $button.data('file-id');
        const originalFileName = $button.data('file-originalname');

        if (!fileId) {
            console.error('File ID not found.');
            return;
        }

        const $spinnerIcon = $button.find('.spinner-icon');
        const apiUrl = '/api/chat/downloadFileById';

        $icon.hide();
        $spinnerIcon.show();

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ FileId: fileId })
            });

            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;

            let filename = originalFileName || `file-${fileId}`;
            const contentDisposition = response.headers.get('Content-Disposition');
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch && filenameMatch[1]) {
                    filename = filenameMatch[1];
                }
            }
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);

        } catch (error) {
            console.error('File download failed:', error);
            alert('Error downloading file. Please try again.');
        } finally {
            $spinnerIcon.hide();
            $icon.show();
        }
    });
});