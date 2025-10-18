$(document).ready(function () {

    // =========================================================================
    //                          File Upload Management
    // =========================================================================
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk
    let activeUploads = {}; // To store active XHR requests for cancellation

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

    // تابع کمکی برای ساخت پیش‌نمایش فایل‌های از قبل آپلود شده
    function addExistingFileToPreview(fileData) {
        const elementId = 'file-' + fileData.messageFileId;
        let previewElement;
        const fileExtension = (fileData.originalFileName || fileData.fileName).split('.').pop().toLowerCase();

        if (window.chatApp.ALLOWED_IMAGES.includes(fileExtension)) {
            const baseUrl = $('#baseUrl').val() || '';
            const imageURL = baseUrl + (fileData.fileThumbPath || fileData.filePath);
            previewElement = `<img src="${imageURL}" class="file-thumbnail" alt="پیش‌نمایش">`;
        } else {
            let icon = `<i class="iconsax" data-icon="document-text-1" aria-hidden="true"></i>`;
            previewElement = `<div class="file-icon">${icon}</div>`;
        }

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
                <span class="action-btn remove-file-btn" data-server-id="${fileData.messageFileId}" data-is-existing="true" title="حذف فایل" style="display: inline-block;">
                     <img src="/chatzy/assets/iconsax/trash.svg" alt="t" />
                </span>
            </div>
        </div>`;
        $('#filePreviewContainer').append(previewHtml);
        checkPreviewContainerVisibility();
        if (typeof init_iconsax === 'function') init_iconsax();
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

        const item = $('#' + elementId);
        item.data('fileObject', file);

        const fileExtension = file.name.split('.').pop().toLowerCase();
        updateFileStatus(elementId, "Preparing...", false, null, true, 0);

        if (!window.chatApp || window.chatApp.ALLOWED_IMAGES.length === 0) {
            await window.chatApp.callAlloewExtentions();
        }

        if (window.chatApp.ALLOWED_IMAGES.includes(fileExtension)) {
            try {
                updateFileStatus(elementId, 'Compressing...', false, null, true, 0);
                const options = { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true };
                const compressedFile = await imageCompression(file, options);
                // After compression, we start the chunked upload
                startChunkedUpload(compressedFile, elementId, file.name);
            } catch (error) {
                updateFileStatus(elementId, 'Compression failed!', true);
            }
        } else if (window.chatApp.ALLOWED_DOCS.includes(fileExtension) || window.chatApp.ALLOWED_AUDIO.includes(fileExtension)) {
            startChunkedUpload(file, elementId, file.name);
        } else {
            updateFileStatus(elementId, 'File type not allowed!', true);
        }
    }

    function startChunkedUpload(file, elementId, originalFileName) {
        const uploadId = 'upload-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        const item = $('#' + elementId);
        item.data('uploadId', uploadId);
        item.data('totalChunks', totalChunks);
        item.data('originalFileName', originalFileName);

        updateFileStatus(elementId, `Uploading 0%`, false, null, true, 0);
        uploadChunk(file, uploadId, 0, totalChunks, elementId, originalFileName);
    }

    function uploadChunk(file, uploadId, chunkIndex, totalChunks, elementId, originalFileName) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('file', chunk, file.name);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', chunkIndex);
        formData.append('totalChunks', totalChunks);
        formData.append('originalFileName', originalFileName);

        const xhr = new XMLHttpRequest();
        activeUploads[elementId] = xhr;

        xhr.open('POST', '/api/chat/UploadFileChunk', true);

        xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) {
                const chunkPercent = e.loaded / e.total;
                const totalPercent = ((chunkIndex + chunkPercent) / totalChunks) * 100;
                updateFileStatus(elementId, `Uploading ${Math.round(totalPercent)}%`, false, null, true, totalPercent);
            }
        };

        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                const response = JSON.parse(xhr.responseText);
                const isLastChunk = (chunkIndex === totalChunks - 1);

                if (isLastChunk) {
                    if (response.success) {
                        updateFileStatus(elementId, 'Success', false, response.fileId, false, 100);
                        addFileIdToHiddenInput(response.fileId.toString(), '#uploadedFileIds');
                        delete activeUploads[elementId];
                    } else {
                        updateFileStatus(elementId, response.message || 'Server error on final chunk', true);
                    }
                } else {
                    uploadChunk(file, uploadId, chunkIndex + 1, totalChunks, elementId, originalFileName);
                }
            } else {
                let errorMessage = 'Connection error';
                try {
                    const errorResponse = JSON.parse(xhr.responseText);
                    errorMessage = errorResponse.message || 'Unknown server error';
                } catch (e) {
                    // Ignore parsing error, use default message
                }
                updateFileStatus(elementId, errorMessage, true);
                delete activeUploads[elementId];
            }
        };

        xhr.onerror = function () {
            updateFileStatus(elementId, 'Network error', true);
            delete activeUploads[elementId];
        };

        xhr.onabort = function () {
            console.log(`Upload for ${elementId} was canceled.`);
            delete activeUploads[elementId];
        };

        xhr.send(formData);
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
                                <span class="status-message">Waiting...</span>
                            </div>
                        </div>
                         <div class="progress-bar-container">
                                <div class="progress-bar"></div>
                            </div>
                    </div>
                </div>
                <div class="status-icon">
                    <span class="action-btn remove-file-btn" data-server-id="" title="Remove File">
                         <img src="/chatzy/assets/iconsax/trash.svg" alt="t">
                    </span>
                    <span class="action-btn retry-upload-btn" title="Retry">
                        <i class="iconsax" data-icon="refresh-2" aria-hidden="true"></i>
                    </span>
                    <span class="action-btn cancel-upload-btn" title="Cancel">
                        <i class="iconsax" data-icon="close-circle" aria-hidden="true"></i>
                    </span>
                </div>
            </div>`;

        $('#filePreviewContainer').append(previewHtml);
        checkPreviewContainerVisibility();
        if (typeof init_iconsax === 'function') init_iconsax();
    }

    function updateFileStatus(elementId, statusText, isError = false, serverFileId = null, inProgress = false, progressPercent = 0) {
        const item = $('#' + elementId);
        item.find('.status-message').text(statusText);

        const progressBarContainer = item.find('.progress-bar-container');
        const progressBar = item.find('.progress-bar');
        const statusTextContainer = item.find('.status-text');

        if (inProgress) {
            statusTextContainer.show();
            progressBarContainer.show();
            progressBar.css('width', progressPercent + '%');
        } else {
            progressBarContainer.hide();
        }

        const removeButton = item.find('.remove-file-btn');
        const retryButton = item.find('.retry-upload-btn');
        const cancelButton = item.find('.cancel-upload-btn');

        removeButton.hide();
        retryButton.hide();
        cancelButton.hide();

        if (serverFileId) {
            removeButton.attr('data-server-id', serverFileId).show();
            item.removeClass('upload-error');
        } else if (isError) {
            retryButton.show();
            removeButton.show(); // Show remove as well, to just discard it
            item.addClass('upload-error');
        } else if (inProgress) {
            cancelButton.show();
        }
    }

    $(document).on('click', '.retry-upload-btn', function () {
        const item = $(this).closest('.file-preview-item');
        const fileObject = item.data('fileObject');
        if (fileObject) {
            item.removeClass('upload-error');
            processFile(fileObject, item.attr('id'));
        }
    });

    function handleRemoveFile(button) {
        const $button = $(button);
        const item = $button.closest('.file-preview-item');
        const elementId = item.attr('id');

        // Cancel any ongoing upload for this item
        if (activeUploads[elementId]) {
            activeUploads[elementId].abort();
        }

        const serverIdToRemove = $button.data('server-id')?.toString();
        const isExistingFile = $button.data('is-existing') === true;

        const img = item.find('img.file-thumbnail');
        if (img.length && img.attr('src').startsWith('blob:')) {
            URL.revokeObjectURL(img.attr('src'));
        }

        item.addClass('removing');
        setTimeout(() => {
            item.remove();
            checkPreviewContainerVisibility();
        }, 400);

        if (serverIdToRemove) {
            if (isExistingFile) {
                addFileIdToHiddenInput(serverIdToRemove, '#deletUploadedFileIds');
            } else {
                removeFileIdFromHiddenInput(serverIdToRemove, '#uploadedFileIds');
                // Send delete request to the server for the already uploaded file
                $.ajax({
                    url: '/Home/DeleteFile',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({ fileId: serverIdToRemove }),
                    success: (response) => console.log(response.success ? 'File successfully deleted.' : 'Error deleting file.'),
                    error: () => alert('Connection error while deleting file.')
                });
            }
        }
    }

    $(document).on('click', '.remove-file-btn', function () {
        handleRemoveFile(this);
    });

    $(document).on('click', '.cancel-upload-btn', function () {
        // This button now specifically cancels and then removes.
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

            if (!hasText && hasFiles && messageDetails.messageFiles.some(f => (f.fileName || '').toLowerCase().endsWith('.webm'))) {
                alert('امکان ویرایش پیام‌های صوتی ضبط شده وجود ندارد.');
                return;
            }

            resetInputState();
            $('#message-action-type').val('edit');
            $('#message-context-id').val(messageId);
            $('#cancel-edit-container').removeClass('force-hide');

            const textarea = $('#message-input');
            const text = (messageDetails.messageText || '').replace(/<br\s*\/?>/gi, '\n');
            textarea.val(text).trigger('input');
            textarea.focus();

            if (hasFiles) {
                const previousFileIds = messageDetails.messageFiles.map(f => f.messageFileId);
                messageDetails.messageFiles.forEach(addExistingFileToPreview);
                $('#previousFileIds').val(previousFileIds.join(','));
            }
        } catch (err) {
            console.error("Error parsing message details for edit.", err);
            alert('خطا در پردازش اطلاعات پیام.');
        }
    });

    $(document).off('click', '#cancel-reply').on('click', '#cancel-reply', function () {
        resetInputState();
    });

    function resetInputState() {
        // Abort all active uploads
        Object.values(activeUploads).forEach(xhr => xhr.abort());
        activeUploads = {};

        $('#reply-to-container').hide();
        $('#cancel-edit-container').addClass('force-hide');
        $('#message-context-id').val('');
        $('#message-action-type').val('');
        $('#message-input').val('').attr('rows', 1);
        $('#filePreviewContainer').empty();
        $('#uploadedFileIds').val('');
        $('#previousFileIds').val('');
        $('#deletUploadedFileIds').val('');
        checkPreviewContainerVisibility();
    }

    // =========================================================================
    //                          File Download Management
    // =========================================================================

    $(document).on('click', '.btn-download-file', function (e) {
        e.preventDefault();
        e.stopPropagation();

        const $button = $(this);
        const fileId = $button.data('file-id');
        if (!fileId) return;

        const $icon = $button.find('img, i');
        const $spinner = $('<span class="spinner-border spinner-border-sm ms-2" role="status" aria-hidden="true"></span>');

        $icon.hide();
        $button.append($spinner);

        const apiUrl = `/api/chat/downloadFileById?fileId=${fileId}`;
        const downloadWindow = window.open(apiUrl, '_blank');

        if (!downloadWindow) {
            alert('Please allow popups for this website to download the file.');
        }

        setTimeout(() => {
            $spinner.remove();
            $icon.show();
        }, 2000);
    });
});