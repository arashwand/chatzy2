// =========================================================================
//                  Group Shared Files Modal Management
// =========================================================================

$(document).ready(function () {

    let _baseUrl = "https://localhost:7040";
    getBaseUrl();

    const groupFilesModal = new bootstrap.Modal(document.getElementById('groupFilesModal'));
    const modalElement = $('#groupFilesModal');
    let currentChatId = null;
    let currentGroupType = null;

    // --- Event Listener for Opening the Modal ---
    $(document).on('click', 'a[data-bs-target="#groupFilesModal"]', function () {
        const tab = $(this).data('tab');
        console.log('click on tag a and tab called')
        currentChatId = $('#current-group-id-hidden-input').val();
        currentGroupType = $('#current-group-type-hidden-input').val();
        // Get chatId and groupType from the active chat window context
        //const activeChat = $('.chat-list-item.active');
        //if (activeChat.length === 0) {
        //    console.error("Could not determine active chat. and chatId: " + chatId + 'and group type: ' + groupType;);
        //    // Optionally, show an error to the user.
        //    return;
        //}
        //currentChatId = activeChat.data('chat-id');
        //currentGroupType = activeChat.data('group-type');

        if (!currentChatId || !currentGroupType) {
            console.error("Active chat is missing data-chat-id or data-group-type.");
            return;
        }

        // Activate the correct tab
        const tabElement = modalElement.find(`#${tab}-tab`);
        if (tabElement.length) {
            new bootstrap.Tab(tabElement[0]).show();
        }

        fetchAndDisplaySharedContent();
    });

    function getBaseUrl() {
        fetch('/Home/GetBaseURL')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch baseUrl');
                }
                return response.json();
            })
            .then(data => {
                _baseUrl = data.baseUrl;
                console.log('_baseUrl is: ' + _baseUrl);
            })
            .catch(error => console.error('Error fetching baseUrl:', error));
    }


    // --- Function to Fetch Data from Server ---
    function fetchAndDisplaySharedContent() {
        console.log('fetchAndDisplaySharedContent called');
        const spinner = modalElement.find('.spinner-container');
        const noFilesMessage = modalElement.find('.no-files-message');
        const tabPanes = modalElement.find('.tab-pane');

        // Reset state
        tabPanes.find('.files-container').empty();
        noFilesMessage.hide();
        spinner.show();

        $.ajax({
            url: `/api/chat/getGroupSharedFiles?chatId=${currentChatId}&groupType=${currentGroupType}`,
            type: 'GET',
            success: function (data) {
                spinner.hide();
                populateTabs(data);
                init_iconsax();
            },
            error: function (xhr, status, error) {
                spinner.hide();
                console.error("Error fetching shared files:", error);
                noFilesMessage.find('p').text('Failed to load files. Please try again.');
                noFilesMessage.show();
            }
        });
    }

    // --- Function to Populate Tabs with Data ---
    function populateTabs(data) {
        const { mediaFiles, documentFiles, links } = data;

        // Populate Media Tab
        populateMediaTab(mediaFiles);

        // Populate Documents Tab
        populateDocsTab(documentFiles);

        // Populate Links Tab
        populateLinksTab(links);

        // Check if all are empty to show a general "no content" message if needed
        if (mediaFiles.length === 0 && documentFiles.length === 0 && links.length === 0) {
            modalElement.find('.no-files-message').find('p').text('No shared content found in this chat.').show();
        }
    }

    // --- Helper Functions for Populating Each Tab ---

    function populateMediaTab(files) {
        const container = $('#media-tab-pane .files-container');
        container.empty();
        if (files && files.length > 0) {
            const template = $('#media-file-template').html();
            files.forEach(file => {
                const item = $(template);
                const thumbnailUrl = file.fileThumbPath ? `${_baseUrl}/${file.fileThumbPath}` : `/${file.filePath}`;
                //item.find('.file-preview-link').attr('href', `/${file.filePath}`);
                item.find('.file-thumbnail').attr('src', thumbnailUrl);
                item.find('.file-name').text(file.fileName);
                item.find('.file-size').text(formatFileSize(file.fileSize));
                item.find('.btn-download-file').attr('data-file-id', file.messageFileId);
                container.append(item);
            });
        } else {
            container.html('<div class="col-12 text-center p-4"><p>No media files found.</p></div>');
        }
    }

    function populateDocsTab(files) {
        const container = $('#docs-tab-pane .files-container');
        container.empty();
        if (files && files.length > 0) {
            const template = $('#doc-file-template').html();
            files.forEach(file => {
                const item = $(template);
                item.find('.file-name').text(file.fileName);
                item.find('.file-size').text(formatFileSize(file.fileSize));
                item.find('.btn-download-file').attr('data-file-id', file.messageFileId);
                container.append(item);
            });
        } else {
            container.html('<li class="list-group-item text-center p-4">No documents found.</li>');
        }
    }

    function populateLinksTab(links) {
        const container = $('#links-tab-pane .files-container');
        container.empty();
        if (links && links.length > 0) {
            const template = $('#link-template').html();
            links.forEach(link => {
                const item = $(template);
                item.find('.link-url').attr('href', link.linkUrl).text(link.linkUrl);
                container.append(item);
            });
        } else {
            container.html('<li class="list-group-item text-center p-4">No links found.</li>');
        }
    }

    // Utility to format file size
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
});
