// =========================================================================
//                  Group Shared Files Modal Management
// =========================================================================

$(document).ready(function () {
    // نیازی به _baseUrl در جاوا اسکریپت نیست چون آدرس‌ها در سرور ساخته می‌شوند

    const modalElement = $('#groupFilesModal');
    const modalBody = modalElement.find('.modal-body'); // بدنه مودال را ذخیره می‌کنیم
    let currentChatId = null;
    let currentGroupType = null;

    // --- Event Listener for Opening the Modal ---
    $(document).on('click', 'a[data-bs-target="#groupFilesModal"]', function () {
        // این خط را دوباره فعال می‌کنیم تا نام تب مورد نظر را بگیریم
        const activeTab = $(this).data('tab');

        currentChatId = $('#current-group-id-hidden-input').val();
        currentGroupType = $('#current-group-type-hidden-input').val();

        if (!currentChatId || !currentGroupType) {
            console.error("Active chat is missing data-chat-id or data-group-type.");
            return;
        }

        const spinnerHtml = `
            <div class="text-center p-5 spinner-container">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>`;
        modalBody.html(spinnerHtml);

        // نام تب فعال را به تابع پاس می‌دهیم
        fetchAndDisplaySharedContent(activeTab);
    });

    // --- Function to Fetch Data from Server ---
    function fetchAndDisplaySharedContent(activeTab = 'media-tab') { // یک مقدار پیش‌فرض تعیین می‌کنیم
        console.log(`fetchAndDisplaySharedContent called for tab: ${activeTab}`);

        $.ajax({
            // پارامتر activeTab را به URL اضافه می‌کنیم
            url: `/Home/GetGroupSharedFilesPartial?chatId=${currentChatId}&groupType=${currentGroupType}&activeTab=${activeTab}`,
            type: 'GET',
            success: function (htmlContent) {
                modalBody.html(htmlContent);
                init_iconsax();
            },
            error: function (xhr, status, error) {
                console.error("Error fetching shared files content:", error);
                const errorMessage = `
                    <div class="text-center p-5">
                        <p class="text-danger">Failed to load files. Please try again.</p>
                    </div>`;
                modalBody.html(errorMessage);
            }
        });
    }

});