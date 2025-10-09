// =========================================================================
// CHAT MODULE (chatApp)
// =========================================================================
// این ماژول تمام منطق‌های مربوط به چت و ارتباط با SignalR را کپسوله می‌کند.
// با استفاده از الگوی IIFE (Immediately Invoked Function Expression)، یک API عمومی
// روی آبجکت window.chatApp قرار می‌دهد و جزئیات پیاده‌سازی را خصوصی نگه می‌دارد.
//==========================================================================

window.chatApp = (function ($) {

    // =================================================
    //            PRIVATE VARIABLES & PROPERTIES
    // =================================================
    // این متغیرها فقط در داخل این ماژول قابل دسترسی هستند.

    let signalRConnection = null;
    let currentUser = null;
    let currentUserNameFamily = "شما";
    let currentUserProfilePic = "UserIcon.png";
    const typingUsers = {}; // { groupId: Set(userFullName) }
    let scrollTimer = null;
    let isMarkingAllMessagesAsRead = false; // پرچم جهت جلوگیری از فراخوانی همزمان دو متد خوانده شده و خوانده همه پیامها در اسکرول

    let heartbeatTimer = null; // متغیر برای نگهداری تایمر Heartbeat
    const HEARTBEAT_INTERVAL = 180 * 1000; // ارسال Heartbeat هر 90 ثانیه (90000 میلی‌ثانیه)



    // =================================================
    //               PRIVATE METHODS
    // =================================================
    // این توابع، عملیات داخلی ماژول را انجام می‌دهند.

    //تابع اعلام وضعیت کاربر انلاین شده
    async function announceUserPresence() {
        console.log("Announcing user presence to the main API...");
        try {
            const response = await fetch('/api/chat/announce', {
                method: 'POST',
                headers: {
                    // مرورگر کوکی احراز هویت را خودکار ارسال می‌کند
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const result = await response.json();
                console.log("Presence announced successfully:", result.message);
            } else {
                console.error("Failed to announce presence. Status:", response.status);
            }
        } catch (error) {
            console.error("A network error occurred while announcing presence:", error);
        }
    }

    // تابع برای ارسال Heartbeat
    // جهت اعلام انلاین بودن کاربر هر 90 ثانیه
    function sendHeartbeatSignal() {
        if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
            console.log("Sending Heartbeat signal...");
            signalRConnection.invoke("SendHeartbeat")
                .catch(err => console.error("Error sending heartbeat signal: ", err));
        } else {
            console.warn("SignalR connection not active for heartbeat.");
        }
    }


    // دریافت اطلاعات قدیمی تر جهت نمایش به کاربر
    let getOldDataRunning = false;// پرچم برای نشان دادن در حال بارگذاری است
    let hasMoreMessages = $('#hasMoreMessages').val();  // پرچم برای نشان دادن موجود بودن پیام‌های بیشتر
    function getOldData() {
        if (hasMoreMessages && !getOldDataRunning) {

            getOldDataRunning = true;
            var lastmessageId = $('#lastMessageIdLoad').val();
            if (lastmessageId == 0) {
                return;
            }

            console.log('last messageId is :' + lastmessageId);
            const chatId = parseInt($('#current-group-id-hidden-input').val());
            const currentGroupType = $('#current-group-type-hidden-input').val();
            $.ajax({
                url: '/Home/GetOldMessage',
                type: 'POST',
                data: { chatId: chatId, groupType: currentGroupType, messageId: lastmessageId },
                success: function (response) {
                    if (response.success) {

                        //  اگر کمتر از 50 ایتم بود، یعنی به انتهای پیام ها رسیده ایم و دیگر درخواست نکند
                        if (response.data.length < 50) {
                            hasMoreMessages = false;
                        }
                        groupMessagesByDate(response.data);

                        var lastMessageIdRecived = parseInt(response.lastMessageId);
                        $('#lastMessageIdLoad').val(lastMessageIdRecived);// مقدار این المان باید بروزرسانی شود با ای دی اخرین پیام

                        console.log('با موفقیت لود شد!' + response.lastMessageId);
                    } else {
                        console.log('خطا در فراخوانی پیامهای قبلی!: ' + response.message);
                    }
                },
                complete: function () {
                    getOldDataRunning = false;
                },
                error: function () {
                    console.log('خطای ارتباط با سرور.');
                }
            });

        } else {
            console.log('getDatarunning is on, or hasMoreMessages = false');
        }

    }

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`; // خروجی مثال: 2025-05-26
    }

    // تبدیل تاریخ به ساعت و دقیقه 
    function convertDateTohhmm(dateTime) {
        const newDate = new Date(dateTime);

        if (isNaN(newDate)) {
            return dateTime; // بازگرداندن مقدار اصلی اگر تاریخ نامعتبر بود
        }

        const hours = newDate.getHours().toString().padStart(2, '0');
        const minutes = newDate.getMinutes().toString().padStart(2, '0');

        return `${hours}:${minutes}`;
    }


    /**
     * پیامهای قدیمی دریافت شده را در بالا اضافه میکند
     * @param {any} messages
     * 
     * 
     */
    function groupMessagesByDate(messages) {
        // مرتب‌سازی پیام‌ها بر اساس زمان (از قدیم به جدید)
        //messages.sort((a, b) => new Date(a.messageDateTime) - new Date(b.messageDateTime));

        const groupedMessages = {};

        // گروه‌بندی پیام‌ها بر اساس تاریخ
        messages.forEach(function (message) {
            const messageDate = new Date(message.messageDateTime);
            const date = formatDate(messageDate);

            if (!groupedMessages[date]) {
                groupedMessages[date] = [];
            }
            groupedMessages[date].push(message);
        });

        for (const date in groupedMessages) {
            const dateId = `date-${date}`;
            const persianDate = convertGregorianToJalaaliSimple(date);
            // const persianDate = dateId; //--برای دیباگ 

            let dateContainer = $(`#Message_Days .message-day[data-message-date="${dateId}"]`);

            // ایجاد بدنه جدید برای تاریخ در صورت عدم وجود
            if (!dateContainer.length) {
                console.log(`بدنه برای تاریخ ${dateId} وجود ندارد. در حال ایجاد...`);
                const newDateHtml = `
                <div class="message-day" data-message-date="${dateId}">
                    <div class="message-divider sticky-top pb-2" data-label="${persianDate}" id="${dateId}"></div>
                </div>`;
                $('#Message_Days').prepend(newDateHtml);
                dateContainer = $(`#Message_Days .message-day[data-message-date="${dateId}"]`);
            } else {
                console.log(`بدنه برای تاریخ ${dateId} وجود دارد.`);
            }

            const divider = dateContainer.find(`#${dateId}`);

            // درج پیام‌ها به ترتیب درست
            groupedMessages[date].forEach(function (message) {
                const messageBody = $(createMessageHtmlBody(message));

                // درج پیام در بالای بدنه (قبل از اولین پیام موجود)
                const firstMessage = dateContainer.find('.message').first();
                if (firstMessage.length) {
                    messageBody.insertBefore(firstMessage);
                } else {
                    divider.after(messageBody); // اگر هیچ پیامی نیست، بعد از divider اضافه شود
                }
            });
        }
    }

    /** زمانی که کاربر پیامی را ارسال میکند 
     * بلافاصله در گروه بصورت ارسال نشده نمایش میدهیم
     *  و بعد از ارسال موفق اپدیت میشود
     */
    function createMessageHtmlBody(message, edited = false) {
        const isSelf = (currentUser == message.senderUserId);
        const liClass = isSelf ? 'personal' : 'new';
        const elementId = message.status === 'sending' ? `message-msg-temp-${message.clientMessageId}` : `message-${message.messageId}`;
        const messageId = message.messageId || '';
        const messageDetailsJson = message.jsonMessageDetails || makeJsonObjectForMessateDetails(message);

        let dropdownHtml = `
            <div class="dropdown message-options">
                <a class="btn" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                    <img src="/chatzy/assets/iconsax/menu-meatballs.svg" alt="menu" />
                </a>
            <div class="dropdown-menu">`;
        if (isSelf) {
            dropdownHtml += `
                             <a class="dropdown-item d-flex align-items-center actionEditMessage" data-messageid="${messageId}" href="#">
                                <img src="/chatzy/assets/iconsax/edit.svg" class="svgInvertColor" alt="ویرایش" />&nbsp;
                                 <span>ویرایش</span>
                             </a>
                            

                              <a class="dropdown-item d-flex align-items-center actionDeleteMessage" data-messageid="${messageId}" href="#">
                                  <img src="/chatzy/assets/iconsax/trash.svg" />&nbsp;
                                  <span>حذف</span>
                              </a>`;
        }
        dropdownHtml += `<a class="dropdown-item d-flex align-items-center actionReplyMessage" data-messageid="${messageId}" href="#">
                              <img src="/chatzy/assets/iconsax/redo-arrow.svg" class="svgInvertColor" />&nbsp;
                              <span>پاسخ دادن</span>
                          </a>
                          <a class="dropdown-item d-flex align-items-center actionSaveMessage" data-messageid="${messageId}" href="#">
                              <img src="/chatzy/assets/iconsax/save-2.svg" class="svgInvertColor" />&nbsp;
                              <span>ذخیره</span>
                          </a>`;
        
        dropdownHtml += `</div></div>`;

        let replyPreviewHtml = '';
        if (message.replyToMessageId && message.replyMessage) {
            replyPreviewHtml = `<div class="reply-preview border p-2 rounded bg-light mb-2" style="cursor:pointer;" onclick="document.getElementById('message-${message.replyToMessageId}')?.scrollIntoView({ behavior: 'smooth', block: 'center' });">
                                    <div class="text-muted small">پاسخ به: <strong>${message.replyMessage.senderUserName}</strong></div>
                                    <div class="text-truncate">${message.replyMessage.messageText || ''}</div>
                                </div>`;
        }

        let filesHtml = '';
        if (message.messageFiles && message.messageFiles.length > 0) {
            filesHtml += '<div class="form-row mt-1 overflow-hidden">';
            message.messageFiles.forEach(file => { filesHtml += createDisplayFileBody(file, isSelf); });
            filesHtml += '</div>';
        }

        const messageTextHtml = message.messageText ? message.messageText.replace(/\n/g, '<br />') : '';
        const editedIndicator = edited ? ` <small class="text-muted fst-italic">(ویرایش شده)</small>` : '';

        let timingHtml = `<div class="timing"><h6>${convertDateTohhmm(message.messageDateTime)}</h6>`;
        if (isSelf) {
            if (message.status === 'sending') {
                timingHtml += '🕒';
            } else {
                timingHtml += `<img class="img-fluid tick" src="/chatzy/assets/images/svg/tick.svg" alt="tick" style="display: ${message.isReadByAnyRecipient ? "none" : "inline"};">
                               <img class="img-fluid tick-all" src="/chatzy/assets/images/svg/tick-all.svg" alt="tick" style="display: ${message.isReadByAnyRecipient ? "inline" : "none"};">`;
            }
        }
        timingHtml += '</div>';

        let personImageHtml = '';
        if (!isSelf) {
            personImageHtml = `<img class="img-fluid person-img" src="/assets/media/avatar/${message.profilePicName || 'UserIcon.png'}" alt="p9">`;
        }

        return `
            <li class="message ${liClass}" id="${elementId}" data-message-id="${messageId}" data-client-id="${message.clientMessageId || ''}" data-sender-id="${message.senderUserId}" data-sender-username="${message.senderUserName}" data-message-details='${messageDetailsJson}'>
                ${dropdownHtml}
                <div class="message-box ${message.isReadByAnyRecipient ? "read" : ""}">
                    ${personImageHtml}
                    <div class="message-box-details">
                        ${replyPreviewHtml}
                        <h5>${messageTextHtml}${editedIndicator}</h5>
                        ${filesHtml}
                        ${timingHtml}
                    </div>
                </div>
            </li>`;
    }


    function createDisplayFileBody(file, isSelf, isReplyed = null) {
        const fileExtension = file.fileName.split('.').pop().toLowerCase();
        console.log('file record extention is : ' + fileExtension);
        var fileHtml = "";

        const baseUrl = $('#baseUrl').val() || '';
        let path = file.fileThumbPath || file.filePath || '';
        const finalPath = path.startsWith('blob:') ? path : baseUrl + path;

        if (publicApi.ALLOWED_IMAGES.includes(fileExtension)) {
            const imageWidth = isReplyed ? '50' : '100';
            fileHtml = `
                <div class="col file-attachment-item" data-file-id="${file.messageFileId}" style="display: flex; flex-direction: column;">
                    <a class="popup-media overflow-hidden" href="${finalPath}" target="_blank">
                        <img class="img-fluid rounded" width="${imageWidth}" src="${finalPath}" alt="${file.fileName}">
                    </a>
                </div>`;
        }
        else if (fileExtension === 'webm') {
            const isBlob = path.startsWith('blob:');
            // برای پیام‌های خودی یا پیام‌های خوش‌بینانه که blob دارند، پلیر کامل را رندر کن
            if (isSelf === 'self' || isBlob) {
                fileHtml = `
            <div class="col file-attachment-item audio-attachment" data-file-id="${file.messageFileId}">
                <div class="audio-player-container">
                    <button class="voice-playback-btn"><i class="iconsax" data-icon="play"></i></button>
                    <div class="voice-timeline-container">
                        <div class="voice-timeline-bg"></div>
                        <div class="voice-timeline-progress"></div>
                        <div class="voice-timeline-handle"></div>
                    </div>
                    <div class="voice-duration-display">0:00</div>
                    <audio class="d-none" src="${finalPath}" preload="metadata"></audio>
                </div>
            </div>`;
            }
            else {
                const fileSize = formatFileSize(file.fileSize);
                // برای پیام‌های دریافتی، دکمه دانلود را نشان بده
                fileHtml = `
                 <div class="col file-attachment-item audio-attachment" data-file-id="${file.messageFileId}">
                     <div class="audio-player-container">
                          <button class="voice-download-btn" data-file-id="${file.messageFileId}">
                             <i class="iconsax" data-icon="arrow-down-2"></i>
                             <i class="fa fa-spinner fa-spin" style="display: none;"></i> <!-- اسپینر پنهان -->
                         </button>
                         <div class="file-meta text-light mx-1 text-dark">${fileSize}</div>
                          <div class="voice-duration-display mx-1" style="margin-right: 15px;">صدای ضبط شده</div>
                     </div>
                 </div>`;
            }
        }
        else {
            // نام فایل را با اولویت originalFileName دریافت کنید
            const displayName = file.originalFileName || file.fileName || 'فایل پیوست';

            // حجم فایل را فقط در صورتی که وجود داشته باشد، فرمت کنید
            const fileSizeText = file.fileSize ? formatFileSize(file.fileSize) : '';

            // اگر حجم فایل 'NaN undefined' شد، آن را نادیده بگیر
            const cleanFileSizeText = fileSizeText.includes('NaN') ? '' : fileSizeText;

            fileHtml = `
            <div class="col file-attachment-item" data-file-id="${file.messageFileId}" style="display: flex; flex-direction: column;">
                    <i class="iconsax" data-icon="document-text-1" style="font-size: 3em;" aria-hidden="true"></i>
                    ${displayName}
                    <span style="min-width:75px;" class="btn-download-file" data-file-id="${file.messageFileId}" data-file-originalName="${file.originalFileName}">
                        
                        <small class="d-block text-muted">${cleanFileSizeText}</small>
                        <img src="/chatzy/assets/iconsax/arrow-down-2.svg" class="download-icon" style="cursor:pointer; margin-top: 5px; width: 24px; height: 24px;" alt="download">
                        <img src="/chatzy/assets/iconsax/spinner.svg" class="spinner-icon" style="display: none; width: 24px; height: 24px;" alt="loading">
                    </span>
            </div>`;

            //const fileSize = formatFileSize(file.fileSize);
            //fileHtml = `
            //    <div class="col file-attachment-item" data-file-id="${file.messageFileId}" style="display: flex; flex-direction: column;">
            //            <i class="fa fa-file-o fa-3x" aria-hidden="true"></i>
            //            <span style="min-width:75px;" class="btn-download-file" data-file-id="${file.messageFileId}">
            //                ${fileSize}
            //                <i class="fa fa-download" style="cursor:pointer"></i>
            //            </span>
            //    </div>`;
        }
        return fileHtml;
    }

    /**
     * فرمت بندی سایز فایل
     * @param {any} bytes
     * @returns
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }


    /**
     * بررسی میکنه اگه پیام جدید رو یک کاربر دیده و مال خودش نبوده، اون پیام رو بصورت خوانده شده به سرور ارسال میکنه
     * و دوتا تیک کنارش قرار میده تا ارسال کننده متوجه بشه این پیام خوانده شده
     * کاربرد دوم : وقتی یک پیام خاص بهش فرستاده نشد، همه پیامهایی که دارای 'data-is-read', 'false' هستند را بررسی میکنه 
     * @param {any} specificMessageElement یک پیام تکی
     * @returns ندارد و مستقیم روی المان مورد نظر اعمال میکند
     */
    function checkVisibleMessages(specificMessageElement = null) {

        // بررسی پرچم
        if (isMarkingAllMessagesAsRead) { // اگر در حال علامت‌گذاری همه پیام‌ها هستیم، کاری نکن
            console.log("Skipping checkVisibleMessages because MarkAllMessagesAsRead is in progress.");
            return;
        }


        const currentGroupIdForCheck = parseInt($('#current-group-id-hidden-input').val());
        const currentGroupTypeForCheck = $('#current-group-type-hidden-input').val();
        const chatContent = $('#chat_content');

        // بررسی پیش‌نیازها
        if (!currentUser || !signalRConnection || signalRConnection.state !== signalR.HubConnectionState.Connected ||
            !chatContent.length || !(currentGroupIdForCheck > 0)) {
            return;
        }

        const processSingleMessage = (msgElement) => {
            const messageId = msgElement.data('message-id');
            const senderId = msgElement.data('sender-id');

            // فقط پیام‌هایی که از کاربر جاری نیستند پردازش شوند
            if (senderId === currentUser || typeof senderId === 'undefined') {
                if (senderId === currentUser) {
                    msgElement.attr('data-is-read', 'true');
                }
                return;
            }

            // بررسی visibility پیام در viewport
            const chatScrollTop = chatContent.scrollTop();
            const chatHeight = chatContent.innerHeight();
            const messageVisibleTop = msgElement.offset().top - chatContent.offset().top + chatScrollTop;
            const messageVisibleBottom = messageVisibleTop + msgElement.outerHeight();
            const viewportTop = chatScrollTop;
            const viewportBottom = chatScrollTop + chatHeight;

            if (messageVisibleBottom > viewportTop && messageVisibleTop < viewportBottom && messageId) {
                msgElement.attr('data-is-read', 'true');
                publicApi.markMessageAsRead(currentGroupIdForCheck, currentGroupTypeForCheck, messageId);
            }
        };

        if (specificMessageElement && specificMessageElement.length && specificMessageElement.attr('data-is-read') === 'false') {
            processSingleMessage(specificMessageElement);
        } else if (!specificMessageElement) {
            // انتخاب پیام‌های خوانده‌نشده که از کاربر جاری نیستند
            const unreadMessages = chatContent.find('.message[data-is-read="false"]').filter(function () {
                return $(this).data('sender-id') !== currentUser && typeof $(this).data('sender-id') !== 'undefined';
            });

            console.log(`Processing ${unreadMessages.length} unread messages from other users.`);
            unreadMessages.each(function () {
                processSingleMessage($(this));
            });
        }
    }

    /**
    * یک متن خلاصه‌ و مناسب برای نمایش در پیش‌نمایش لیست چت‌ها ایجاد می‌کند.
    * @param {object} message - شیء کامل پیام.
    * @returns {string} - رشته HTML برای نمایش در پیش‌نمایش.
    */
    function createMessagePreviewText(message) {
        // اولویت اول: اگر پیام متن دارد، همان متن را برگردان
        if (message.messageText && message.messageText.trim() !== '') {
            return message.messageText;
        }

        // اولویت دوم: اگر متن ندارد ولی فایل دارد
        if (message.messageFiles && message.messageFiles.length > 0) {
            const firstFile = message.messageFiles[0];
            const fileName = firstFile.originalFileName || firstFile.fileName || '';
            const fileExtension = fileName.split('.').pop().toLowerCase();

            // بررسی اینکه آیا فایل صوتی است یا خیر
            if (publicApi.ALLOWED_AUDIO.includes(fileExtension)) {
                return '<i class="iconsax" data-icon="mic-2" style="margin-left: 5px;"></i> فایل ضبط شده';
            }

            // بررسی اینکه آیا فایل تصویر است یا خیر
            if (publicApi.ALLOWED_IMAGES.includes(fileExtension)) {
                return '<i class="iconsax" data-icon="camera" style="margin-left: 5px;"></i> عکس';
            }

            // برای سایر فایل‌ها (داکیومنت و غیره)
            // نام فایل را کوتاه کرده و نمایش می‌دهیم
            const truncatedName = fileName.length > 20
                ? fileName.substring(0, 18) + '...'
                : fileName;

            return `<i class="iconsax" data-icon="paperclip-2" style="margin-left: 5px;"></i> ${truncatedName}`;
        }

        // حالت نهایی: اگر پیام به هر دلیلی کاملاً خالی بود
        return 'پیام';
    }


    //*** پیام جدید را در پنجره چت نمایش می‌دهد.
    // جایگزین تابع displayMessage فعلی کنید
    function displayMessage(message) {
        console.log("Displaying message received:", message);
        console.log(`Displaying message for group ${message.groupId}. Active group is ${$('#current-group-id-hidden-input').val()}`);


        const activeGroupId = parseInt($('#current-group-id-hidden-input').val());
        const currentUserId = parseInt($('#userId').val());
        const isSelf = (currentUserId === message.senderUserId);

        console.log('activeGroup :' + activeGroupId + ' currentUserId: ' + currentUserId + ' isSelf: ' + isSelf);

        // ۱. به‌روزرسانی پیش‌نمایش آخرین پیام در سایدبار
        const chatTextElement = document.getElementById(`chatText_${message.groupType}_${message.groupId}`);
        const chatTimeElement = document.getElementById(`chatTime_${message.groupType}_${message.groupId}`);
        if (chatTextElement && chatTimeElement) {
            //chatTextElement.innerHTML = `<span>${message.senderUserName}:</span> ${message.messageText}`;
            const previewText = createMessagePreviewText(message);

            chatTextElement.innerHTML = `<span>${message.senderUserName}:</span> ${previewText}`;

            chatTimeElement.innerText = convertDateTohhmm(message.messageDateTime);
            const listItem = document.getElementById(`chatListItem_${message.groupId}`);
            if (listItem) {
                listItem.parentElement.prepend(listItem);
            }
        }

        // ۲. بررسی اینکه پیام متعلق به گروه فعال است یا نه
        if (message.groupId === activeGroupId) {
            console.log('message.groupId === activeGroupId');
            const chat_content = $('#chat_content');

            const messageDate = new Date(message.messageDateTime);
            const dateStr = formatDate(messageDate);
            let messageList = $(`#chatMessages-${dateStr}`);

            if (!messageList.length) {
                const persianDate = new Date(message.messageDateTime).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
                const newDayHtml = `<h6 class="fw-normal text-center heading chatInDateLabelClass">${persianDate}</h6>
                                    <ul class="message-box-list" id="chatMessages-${dateStr}"></ul>`;
                $('#Message_Days').append(newDayHtml);
                messageList = $(`#chatMessages-${dateStr}`);
            }

            if (!chat_content.length || !messageList.length) {
                console.error("Chat container elements not found.");
                return;
            }

            const scrollHeightBefore = chat_content.prop("scrollHeight");
            const scrollTopBefore = chat_content.scrollTop();
            const clientHeight = chat_content.innerHeight();
            const wasAtBottom = (scrollHeightBefore - (scrollTopBefore + clientHeight)) <= 30;

            const msgHtml = createMessageHtmlBody(message);
            const $msgElement = $(msgHtml);
            messageList.append($msgElement);

            // Re-initialize icons for the new message
            if (typeof init_iconsax === 'function') {
                init_iconsax();
            }

            // 1. بررسی کنید آیا پیام حاوی فایل صوتی است یا خیر
            const hasAudioFile = message.messageFiles && message.messageFiles.some(file =>
                file.fileName.toLowerCase().endsWith('.webm') ||
                (file.fileType && file.fileType.startsWith('audio'))
            );

            // 2. اگر و تنها اگر فایل صوتی وجود داشت، منطق مربوط به صدا را اجرا کنید
            if (hasAudioFile) {
                const $audio = $msgElement.find('.audio-player-container audio');
                if ($audio.length) {
                    const audioElement = $audio.get(0);
                    const $container = $audio.closest('.audio-player-container');
                    const $durationDisplay = $container.find('.voice-duration-display');

                    // تابع برای به‌روزرسانی UI
                    const setDurationText = (duration) => {
                        if (duration && isFinite(duration)) {
                            $durationDisplay.text(formatAudioTime(duration));
                        } else {
                            $durationDisplay.text('?:??');
                        }
                    };

                    // 1. ابتدا با روش سریع تلاش می‌کنیم
                    if (audioElement.duration && isFinite(audioElement.duration)) {
                        setDurationText(audioElement.duration);
                    }
                    // 2. اگر روش سریع کار نکرد، به سراغ راه‌حل‌های دیگر بروید
                    else {
                        const audioSrc = audioElement.src;
                        if (audioSrc && audioSrc.startsWith('blob:')) {
                            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                            fetch(audioSrc)
                                .then(response => response.arrayBuffer())
                                .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
                                .then(audioBuffer => {
                                    setDurationText(audioBuffer.duration);
                                })
                                .catch(err => {
                                    console.error('Web Audio API failed to decode audio:', err);
                                    setDurationText(null);
                                });
                        } else {
                            $audio.one('loadedmetadata', function () {
                                setDurationText(this.duration);
                            });
                        }
                    }
                } else {
                    console.warn('Message was marked as audio, but .audio-player-container was not found in the DOM.');
                }
            }

            

            // مدیریت اسکرول خودکار یا نمایش اعلان "پیام جدید"
            if (isSelf || wasAtBottom) {
                // اگر پیام از طرف خود کاربر بود یا کاربر در پایین‌ترین نقطه اسکرول نبود، به پایین برو
                requestAnimationFrame(() => {
                    const chatFinished = $('#chat-finished');
                    chatFinished[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    $('#newMessagesNotice').hide().data('newCount', 0).text('');
                });
            } else {
                // در غیر این صورت، اعلان پیام جدید را نشان بده
                const newNotice = $('#newMessagesNotice');
                let count = newNotice.data('newCount') || 0;
                count++;
                newNotice.data('newCount', count).text(`مشاهده ${count} پیام جدید`).show();
            }

            // بررسی وضعیت خوانده شدن پیام جدید (اگر برای دیگران باشد)
            if (!isSelf) {
                const newMessageElement = $(`#message-${message.messageId}, #message-msg-temp-${message.clientMessageId}`).first();
                if (newMessageElement.length) {
                    setTimeout(() => {
                        checkVisibleMessages(newMessageElement);
                    }, 250);
                }
            }

        } else if (!isSelf) {
            console.log('message.groupId !== activeGroupId')

        }
    }

    function formatAudioTime(time) {
        if (isNaN(time) || !isFinite(time)) {
            console.log('isNaN || !isFinite');
            return "0:00";
        }
        console.log('formatAudioTime : ' + time)
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    function updateUnreadCountForGroup(key, count) {
        const unreadBadge = $(`#unreadCountBadge_${key}`);
        console.log(`updateUnreadCountForGroup Called! key: ${key}, count: ${count}, type: ${typeof count}`);

        if (!unreadBadge.length) {
            console.log('unread container not found!');
            return;
        } else {
            console.log(`Current badge text: ${unreadBadge.text()}, has d-none: ${unreadBadge.hasClass('d-none')}`);
            if (count === 0) {
                console.log('Entering count === 0 block');
                unreadBadge.text(count).addClass('d-none');
            } else {
                console.log(`Entering else block with count: ${count}`);
                unreadBadge.text(count).removeClass('d-none');
            }
            console.log(`After update - badge text: ${unreadBadge.text()}, has d-none: ${unreadBadge.hasClass('d-none')}`);
        }
    }


    /**
      * محتوای یک پیام ویرایش شده را در UI به‌روز می‌کند و داده‌های پنهان آن را نیز آپدیت می‌کند.
      */
    function handleEditedMessage(message) {
        console.log("Received edit for messageId: " + message.messageId);
        const messageElement = $('#message-' + message.messageId);
        if (!messageElement.length) {
            console.warn("Received edit for a message that is not currently visible:", message.messageId);
            return;
        }

        const newHtml = createMessageHtmlBody(message, true); // Pass true for edited
        messageElement.replaceWith(newHtml);

        if (typeof init_iconsax === 'function') {
            init_iconsax();
        }
        console.log(`Message ${message.messageId} UI was successfully replaced and updated.`);
    }


    //*** وضعیت آنلاین/آفلاین یک کاربر را در UI به‌روز می‌کند
    function updateUserStatusIcon(userId, isOnline, groupId, groupType) {
        const selector = `.user-status-icon[data-user-id='${userId}'][data-group-id='${groupId}'][data-group-type='${groupType}']`;
        const icon = $(selector);
        if (icon.length === 0) return;
        icon.toggleClass('avatar-online', isOnline).toggleClass('avatar-offline', !isOnline).attr('title', isOnline ? 'آنلاین' : 'آفلاین');
        console.log('userid :' + userId + ' status isOnline:' + isOnline);
    }

    //*** نشانگر "در حال تایپ" را برای چندین کاربر به‌روز می‌کند.*/
    function updateTypingIndicator(groupId) {
        const typingContainer = $(`#typing-indicator-${groupId}`);
        const currentTypers = typingUsers[groupId];

        if (!currentTypers || currentTypers.size === 0) {
            typingContainer.text('').hide();
            return;
        }

        const names = Array.from(currentTypers);
        const displayText = names.length === 1
            ? `${names[0]} در حال تایپ است...`
            : `${names.join('، ')} در حال تایپ هستند...`;

        typingContainer.text(displayText).show();
    }

    // --- SignalR Event Handlers ---

    function handleUserTyping(userId, fullName, groupId) {
        if (!typingUsers[groupId]) typingUsers[groupId] = new Set();
        typingUsers[groupId].add(fullName);
        updateTypingIndicator(groupId);

        // اگر کاربر تا 3 ثانیه بعد وضعیت "توقف تایپ" را نفرستاد، به طور خودکار حذف شود
        if (!typingUsers[groupId].timers) typingUsers[groupId].timers = {};
        clearTimeout(typingUsers[groupId].timers[userId]);
        typingUsers[groupId].timers[userId] = setTimeout(() => {
            handleUserStopTyping(userId, fullName, groupId);
        }, 3000);
    }

    function handleUserStopTyping(userId, fullName, groupId) {
        if (typingUsers[groupId]) {
            typingUsers[groupId].delete(fullName);
            updateTypingIndicator(groupId);
        }
    }

    // وقتی پیام توسط دیگران خوانده شد، اطلاعات خوانندگان را برای ارسال کننده بروزرسانی میکنه
    function handleMessageReadByRecipient(messageId, senderUserId, readerFullName) {
        console.log('handleMessageReadByRecipient messageId: ' + messageId + ' currentUser :' + currentUser + ' and senderUserId : ' + senderUserId);
        const messageElement = $('#message-' + messageId);
        if (messageElement.length && messageElement.data('sender-id') == currentUser) {
            const seenHtml = `<img width="15" src="/assets/media/icons/seen-green.svg" />`
            messageElement.find('.message-status-ticks').html(seenHtml).attr('title', 'خوانده شده توسط ' + readerFullName);
            // If you want to accumulate readers:
            const currentTitle = messageElement.find('.message-status-ticks').attr('title') || 'خوانده شده توسط:';
            if (!currentTitle.includes(readerFullName)) {
                messageElement.find('.message-status-ticks').attr('title', currentTitle + ' ' + readerFullName);
            }
        }
    }

    // وقتی پیام توسط یک فرد خوانده شد، پیام مورد نظر را بصورت خوانده شده تغیر میده و تعداد خوانده نشده را نیز اپدیت میکنه
    function handleMessageSuccessfullyMarkedAsRead(messageId, groupId, groupType, unreadCount) {
        console.log(`MessageSuccessfullyMarkedAsRead called: messageId=${messageId}, groupId=${groupId}, groupType=${groupType}, unreadCount=${unreadCount}, time=${new Date().toISOString()}`);
        const messageElement = $('#message-' + messageId);
        if (messageElement.length) {
            messageElement.attr('data-is-read', 'true');

        }

        // بروزرسانی تعداد پیام خوانده نشده
        const key = `${groupType}_${groupId}`;
        updateUnreadCountForGroup(key, unreadCount)
    }

    // وقتی کاربر بر روس مشاده همه کلیک کرد وضعیت همه پیامهای خوانده نشده را بصورت خوانده شده تغیر میده و تعداد خوانده نشده را نیز اپدیت میکنه
    function handleAllUnreadMessageSuccessfullyMarkedAsRead(messageIds, groupId, groupType, unreadCount) {

        console.log(`handleAllUnreadMessageSuccessfullyMarkedAsRead called: messageIds = ${messageIds}, groupId = ${groupId}, groupType = ${groupType}, unreadCount = ${unreadCount}, time = ${new Date().toISOString()}`);

        // 1. مهم: به دلیل اینکه messageIds از سرور ممکن است خالی بیاید (به دلیل TTL Redis),
        // باید تمام پیام‌های موجود در UI را که هنوز "خوانده نشده" هستند، به صورت اجباری علامت‌گذاری کنیم.
        // این کار UI را با شمارنده 0 همگام می‌کند.
        $('#chat_content .message[data-is-read="false"]').each(function () {
            $(this).attr('data-is-read', 'true');
            // در اینجا نیازی به فراخوانی publicApi.markMessageAsRead نیست،
            // چون عملیات markAllMessagesAsRead در سمت سرور انجام شده و شمارنده کلی ریست شده است.
            // هدف اینجا فقط به‌روزرسانی وضعیت ظاهری در UI است.
        });

        messageIds.forEach(messageId => {
            $(`#message-${messageId}`).attr('data-is-read', 'true');
        });


        // بروزرسانی تعداد پیام خوانده نشده
        const key = `${groupType}_${groupId}`;
        updateUnreadCountForGroup(key, unreadCount)

        isMarkingAllMessagesAsRead = false; // عملیات به پایان رسید، پرچم را ریست کن

        // 1. لیسنر اسکرول را مجدداً فعال کن
        window.chatApp.setScrollListenerActive(true); //

        // 2. یک بررسی نهایی برای پیام‌های قابل مشاهده، پس از بازگشت کنترل و رندر شدن صفحه
        setTimeout(checkVisibleMessages, 100); // 100ms به عنوان تلرانس برای رندرینگ DOM
    }


    function handleDeleteMessage(messageId, result) {
        console.log('indide UserDeleteMessage ' + messageId + ' and result is :' + result);
        // نتیجه را پردازش میکنیم اگر موفق بود حذف میشود و اگر ناموفق بود به کاربر پیام نمایش داده میشود
        const messageElement = $('#message-' + messageId);
        if (result === true) {
            if (messageElement.length) {
                // اضافه کردن transition به صورت مستقیم
                messageElement.css('transition', 'opacity 0.5s ease-in-out, transform 0.5s ease-in-out');

                messageElement.addClass('removing');
                setTimeout(() => {
                    messageElement.remove();
                }, 400);
            }
        } else {
            console.log('result from hub to handleDeleteMessage has error')
        }
    }

    function handleUserSaveMessage(messageId, result) {
        console.log('result from hub to handleUserSaveMessage')
        // نتیجه را پردازش میکنیم اگر موفق بود حذف میشود و اگر ناموفق بود به کاربر پیام نمایش داده میشود
        const messageElement = $('#message-' + messageId);
        if (result === true) {
            console.log('result equal true')
            if (messageElement.length) {
                messageElement.addClass('removing');
                setTimeout(() => {
                    messageElement.remove();
                }, 400);
            }
        } else {
            console.log('result from hub to handleUserSaveMessage has error')
        }
    }

    function makeJsonObjectForMessateDetails(message) {
        try {
            console.log('inside makeJsonObjectForMessateDetails ******************************' + message)
            // بررسی وجود آبجکت message و خواص اصلی آن
            if (!message || !message.messageText) {
                throw new Error("Invalid message object: messageText is missing.");
            }

            const messageDetails = {
                messageText: message.messageText,
                replyToMessageId: message.replyToMessageId,
                replyMessage: message.replyMessage,
                messageFiles: message.messageFiles,
            };

            // تبدیل آبجکت به رشته JSON
            const messageDetailsJson = JSON.stringify(messageDetails);

            // نمایش نتیجه موفقیت‌آمیز در کنسول
            console.log("JSON object created successfully:", messageDetailsJson);

            return messageDetailsJson;
        } catch (error) {
            // مدیریت و نمایش خطا در کنسول
            console.error("An error occurred:", error.message);
            // بازگرداندن مقدار null یا یک رشته خالی در صورت بروز خطا
            return null;
        }
    }

    //function makeJsonObjectForMessateDetails(message) {
    //    const messageDetails = {
    //        messageText: message.messageText,
    //        replyToMessageId: message.replyToMessageId,
    //        replyMessage: message.replyMessage, // این آبجکت باید شامل senderUserName و messageText باشد
    //        messageFiles: message.messageFiles // این آرایه‌ای از آبجکت‌های فایل است
    //    };
    //    // تبدیل آبجکت به رشته JSON و escape کردن آن برای امنیت
    //    const messageDetailsJson = JSON.stringify(messageDetails);

    //    return messageDetailsJson;
    //}


    /**
  * وضعیت یک پیام موجود در UI را به‌روز می‌کند.
  * @param {string} clientMessageId - شناسه موقتی که در کلاینت ایجاد شده بود.
  * @param {object} savedMessage - آبجکت کامل پیام که از سرور برگشته است.
  * @param {'sent' | 'failed'} newStatus - وضعیت جدید پیام.
  */
    function updateMessageStatus(clientMessageId, savedMessage, newStatus, jsonObject = null) {
        console.log('clientMessageId: ' + clientMessageId + ' newStatus:' + newStatus);
        // ۱. پیدا کردن المان پیام موقت با استفاده از شناسه کلاینت
        const messageElement = $(`#message-msg-temp-${clientMessageId}`);

        // اگر به هر دلیلی المان پیدا نشد، خارج شو
        if (!messageElement.length) {
            console.warn("Could not find message element to update status for:", clientMessageId);
            return;
        }

        const timingElement = messageElement.find('.timing');
        if (newStatus === 'sent') {
            // ۲. اگر ارسال موفق بود، تمام اطلاعات را با داده‌های نهایی سرور آپدیت کن

            // تغییر ID اصلی المان به شناسه واقعی سرور
            messageElement.attr('id', `message-${savedMessage.messageId}`);

            // به‌روزرسانی data attribute ها برای استفاده در آینده (مثل ویرایش و پاسخ)
            messageElement.attr('data-message-id', savedMessage.messageId);

            console.log('**********************************Start for update json details  ********************************** ');
            // ایجاد آبجکت جهت بروز رسانی

            messageElement.attr('data-message-details', jsonObject);
            // messageElement.attr('data-message-details', messageDetailsJson);

            console.log('**********************************End for update json details  ********************************** ');


            // تغییر آیکون وضعیت از "ساعت" به "تیک"  
            if (timingElement.length) {
                timingElement.html(`
                    <img class="img-fluid tick" src="/chatzy/assets/images/svg/tick.svg" alt="tick" style="display: inline;">
                    <img class="img-fluid tick-all" src="/chatzy/assets/images/svg/tick-all.svg" alt="tick" style="display: none;">
                `);
            } else {
                console.log('timingElement not found!');
            }
            

            //  بروزرسانی نام فرستنده
            const messageSenderElement = messageElement.find('.message-sender-name').last();
            if (messageSenderElement.length) {
                messageSenderElement.html(savedMessage.senderUser.nameFamily); //SenderUser?.NameFamily
                console.log(savedMessage.senderUserName);
            } else {
                console.log('messageSenderElement not found!');
            }


            // به‌روزرسانی زمان پیام با زمان دقیق سرور 
            const timeElement = messageElement.find('.message-date').last();
            if (timeElement.length) {
                // تابع convertDateTohhmm باید در دسترس باشد
                timeElement.text(convertDateTohhmm(savedMessage.messageDateTime));
            }

            // به‌روزرسانی فایل‌های پیوست (اگر وجود داشته باشند)
            if (savedMessage.messageFiles && Array.isArray(savedMessage.messageFiles)) {
                savedMessage.messageFiles.forEach(file => {
                    console.log('------------------------------------############################' + file.messageFileId + 'fileName : ' + file.originalFileName);
                    // پیدا کردن المان فایل بر اساس data-file-id
                    const fileElement = messageElement.find(`.file-attachment-item[data-file-id="${file.messageFileId}"]`);
                    if (fileElement.length) {
                        // اگر فایل از نوع تصویر است، src و href را به‌روزرسانی کن
                        if (file.fileType && file.fileType.toLowerCase().startsWith('image/')) {
                            const imgElement = fileElement.find('img');
                            const linkElement = fileElement.find('a.popup-media');
                            if (imgElement.length && file.url) {
                                imgElement.attr('src', file.url);
                                imgElement.attr('alt', file.fileName || 'image');
                            }
                            if (linkElement.length && file.url) {
                                linkElement.attr('href', file.url);
                            }
                        }
                    } else {
                        console.warn(`File element with ID ${file.messageFileId} not found!`);
                    }
                });
            }

            // شناسه تمام لینک‌های عملیات داخل منوی کشویی را نیز آپدیت کن
            messageElement.find('.dropdown-menu a').each(function () {
                $(this).attr('data-messageid', savedMessage.messageId);
            });

        }
        else if (newStatus === 'failed') {
            // ۳. اگر ارسال ناموفق بود، یک استایل خطا به آن بده
            const timingElement = messageElement.find('.timing');
            timingElement.html('<span class="text-danger">❗</span>');

        }
    }

    /**
     * بروز رسانی پیام ویرایش شده زمانی که نتیجه ارسال از سرور دریافت شد
     * @param {any} messageId
     * @param {any} savedMessage
     * @param {any} newStatus
     * @returns
     */
    function updateEditMessageStatus(messageId, savedMessage, newStatus, jsonObject = null) {
        console.log('Edit messageId: ' + messageId + ' newStatus:' + newStatus);
        // ۱. پیدا کردن المان پیام موقت با استفاده از شناسه کلاینت
        const messageElement = $(`#message-${messageId}`);

        // اگر به هر دلیلی المان پیدا نشد، خارج شو
        if (!messageElement.length) {
            console.warn("Could not find message element to update status for:", messageId);
            return;
        }

        const timingElement = messageElement.find('.timing');
        if (newStatus === 'sent') {
            // ۲. اگر ارسال موفق بود، تمام اطلاعات را با داده‌های نهایی سرور آپدیت کن

            // تغییر ID اصلی المان به شناسه واقعی سرور
            messageElement.attr('id', `message-${savedMessage.messageId}`);

            // به‌روزرسانی data attribute ها برای استفاده در آینده (مثل ویرایش و پاسخ)
            messageElement.attr('data-message-id', savedMessage.messageId);

            console.log('**********************************Start for update json details  ********************************** ');
            // ایجاد آبجکت جهت بروز رسانی

            messageElement.attr('data-message-details', jsonObject);
            // messageElement.attr('data-message-details', messageDetailsJson);

            console.log('**********************************End for update json details  ********************************** ');


            // تغییر آیکون وضعیت از "ساعت" به "تیک"  
            if (timingElement.length) {
                timingElement.html(`
                    <img class="img-fluid tick" src="/chatzy/assets/images/svg/tick.svg" alt="tick" style="display: inline;">
                    <img class="img-fluid tick-all" src="/chatzy/assets/images/svg/tick-all.svg" alt="tick" style="display: none;">
                `);
            } else {
                console.log('timingElement not found!');
            }


            //  بروزرسانی نام فرستنده
            const messageSenderElement = messageElement.find('.message-sender-name').last();
            if (messageSenderElement.length) {
                messageSenderElement.html(savedMessage.senderUser.nameFamily); //SenderUser?.NameFamily
                console.log(savedMessage.senderUserName);
            } else {
                console.log('messageSenderElement not found!');
            }


            // به‌روزرسانی زمان پیام با زمان دقیق سرور 
            const timeElement = messageElement.find('.message-date').last();
            if (timeElement.length) {
                // تابع convertDateTohhmm باید در دسترس باشد
                timeElement.text(convertDateTohhmm(savedMessage.messageDateTime));
            }

            // به‌روزرسانی فایل‌های پیوست (اگر وجود داشته باشند)
            if (savedMessage.messageFiles && Array.isArray(savedMessage.messageFiles)) {
                savedMessage.messageFiles.forEach(file => {
                    console.log('------------------------------------############################' + file.messageFileId + 'fileName : ' + file.originalFileName);
                    // پیدا کردن المان فایل بر اساس data-file-id
                    const fileElement = messageElement.find(`.file-attachment-item[data-file-id="${file.messageFileId}"]`);
                    if (fileElement.length) {
                        // اگر فایل از نوع تصویر است، src و href را به‌روزرسانی کن
                        if (file.fileType && file.fileType.toLowerCase().startsWith('image/')) {
                            const imgElement = fileElement.find('img');
                            const linkElement = fileElement.find('a.popup-media');
                            if (imgElement.length && file.url) {
                                imgElement.attr('src', file.url);
                                imgElement.attr('alt', file.fileName || 'image');
                            }
                            if (linkElement.length && file.url) {
                                linkElement.attr('href', file.url);
                            }
                        }
                    } else {
                        console.warn(`File element with ID ${file.messageFileId} not found!`);
                    }
                });
            }

            // شناسه تمام لینک‌های عملیات داخل منوی کشویی را نیز آپدیت کن
            messageElement.find('.dropdown-menu a').each(function () {
                $(this).attr('data-messageid', savedMessage.messageId);
            });

        }
        else if (newStatus === 'failed') {
            // ۳. اگر ارسال ناموفق بود، یک استایل خطا به آن بده
            const timingElement = messageElement.find('.timing');
            timingElement.html('<span class="text-danger">❗</span>');
            alert('خطا در ویرایش پیام : ' + newStatus);
        }
    }


    // =================================================
    //                 PUBLIC API
    // =================================================
    // این آبجکت به بیرون return می‌شود و توابع آن از همه جا قابل دسترس خواهند بود.

    const publicApi = {

        connection: null,
        displayMessage: displayMessage,
        /**
         * ماژول چت را راه‌اندازی کرده و به SignalR متصل می‌شود.
         * این تابع باید در ابتدای بارگذاری صفحه فراخوانی شود.
         */
        init: function () {
            // فراخوانی اولیه برای بارگذاری پسوندها
            publicApi.callAlloewExtentions();

            currentUser = $('#userId').val(); // Ensure this is correctly fetching the numeric or string ID as used in senderUserId
            if (!currentUser) {
                console.error("UserId not found. ChatApp cannot initialize.");
                return;
            }
            currentUser = parseInt(currentUser);
            currentUserProfilePic = parseInt($('#userProfilePic').val());
            currentUserNameFamily = parseInt($('#fullName').val());
            signalRConnection = new signalR.HubConnectionBuilder()
                .withUrl("/webappchathub")
                .withAutomaticReconnect()
                .build();

            publicApi.connection = signalRConnection;

            // ثبت رویدادهای دریافتی از سرور
            //signalRConnection.on("ReceiveMessage", message);
            signalRConnection.on("ReceiveMessage", function (message) {
                if (message.senderUserId !== currentUser) {
                    displayMessage(message);
                }
            });

            signalRConnection.on("ReceiveEditedMessage", handleEditedMessage);

            // دریافت و اعمال تعداد پیامهای خوانده نشده
            signalRConnection.on("UpdateUnreadCount", function (key, count) {
                console.log(`UpdateUnreadCount received: key=${key}, count=${count}, type=${typeof count}`);
                if (typeof count !== 'number' || isNaN(count)) {
                    console.warn(`Invalid count value received: ${count}`);
                    return;
                }
                updateUnreadCountForGroup(key, count);
            });

            signalRConnection.on("UserStatusChanged", function (userId, isOnline, groupId, groupType) {
                // لاگ برای اطمینان از دریافت رویداد در مرورگر
                console.log(`CLIENT RECEIVED: UserStatusChanged for user ${userId} in group ${groupId}. IsOnline: ${isOnline}`);

                // فراخوانی تابع اصلی شما برای آپدیت UI
                updateUserStatusIcon(userId, isOnline, groupId, groupType);
            });

            signalRConnection.on("MessageSentSuccessfully", function (savedMessage, jsonObject) {
                console.log("Successfully sent message, server confirmation received:", savedMessage);
                // فراخوانی تابعی که پیام موقت را با اطلاعات نهایی سرور آپدیت می‌کند
                updateMessageStatus(savedMessage.clientMessageId, savedMessage, 'sent', jsonObject);
            });


            signalRConnection.on("EditMessageSentSuccessfully", function (savedEditMessage, jsonObject) {
                console.log("Successfully Edit message, server confirmation received:", savedEditMessage);
                // فراخوانی تابعی که پیام موقت را با اطلاعات نهایی سرور آپدیت می‌کند
                updateEditMessageStatus(savedEditMessage.messageId, savedEditMessage, 'sent', jsonObject);
            });

            // وقتی پیام ارسالی با خطا مواجه شده است
            signalRConnection.on("MessageSentFailed", function (clientMessageId) {
                console.log("Edit Message Has Failed in clientMessageId:", clientMessageId);
                // فراخوانی تابعی که پیام موقت را با اطلاعات نهایی سرور آپدیت می‌کند
                updateMessageStatus(clientMessageId, null, 'failed');
            });

            // وقتی  پیام ویرایش شده با خطا مواجه شده است
            signalRConnection.on("EditMessageSentFailed", function (messageId) {
                console.log("Edit Message Has Failed in messageId:", messageId);
                // فراخوانی تابعی که پیام موقت را با اطلاعات نهایی سرور آپدیت می‌کند
                updateEditMessageStatus(messageId, null, 'failed');
            });

            signalRConnection.on("UserTyping", handleUserTyping);
            signalRConnection.on("UserStoppedTyping", handleUserStopTyping);
            signalRConnection.on("MessageReadByRecipient", handleMessageReadByRecipient);
            signalRConnection.on("MessageSuccessfullyMarkedAsRead", handleMessageSuccessfullyMarkedAsRead);
            signalRConnection.on("AllUnreadMessagesSuccessfullyMarkedAsRead", handleAllUnreadMessageSuccessfullyMarkedAsRead);
            signalRConnection.on("UserDeleteMessage", handleDeleteMessage);
            signalRConnection.on("UserSaveMessage", handleUserSaveMessage);

            // مدیریت خطا در ارسال پیام
            signalRConnection.on("SendMessageError", function (errorMessage) {
                console.error("Server returned an error for sending message:", errorMessage);
                // اینجا می‌توانید یک پیام خطا به کاربر نمایش دهید
            });


            signalRConnection.start()
                .then(() => {
                    console.log("ChatApp initialized and connected for user: " + currentUser);
                    // Initial check for visible messages once connected and UI is likely stable

                    //  پس از اتصال موفق به هاب داخلی، حضور کاربر را به سرور اصلی اعلام می‌کنیم
                    //========================================================================
                    announceUserPresence();

                    // فعال کردن لیسنر اسکرول هنگام شروع برنامه
                    publicApi.setScrollListenerActive(true); // لیسنر اسکرول را در ابتدا فعال کن

                    setTimeout(checkVisibleMessages, 500);

                    // راه‌اندازی تایمر Heartbeat پس از اتصال موفق
                    if (heartbeatTimer) clearInterval(heartbeatTimer); // اگر تایمر قبلی وجود دارد، آن را پاک کن
                    heartbeatTimer = setInterval(sendHeartbeatSignal, HEARTBEAT_INTERVAL);
                    console.log(`Heartbeat timer started, sending every ${HEARTBEAT_INTERVAL / 1000} seconds.`);

                })
                .catch(err => console.error("SignalR Connection error:", err));

            signalRConnection.onclose((error) => {
                console.warn("SignalR connection closed.", error);
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer); // پاک کردن تایمر Heartbeat هنگام قطع اتصال
                    heartbeatTimer = null;
                    console.log("Heartbeat timer stopped due to connection close.");
                }
            });
        },

        // یک متد برای قطع اتصال دستی هنگام لاگ‌اوت اضافه می‌کنیم
        disconnect: function () {
            if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
                console.log("Attempting to disconnect from SignalR hub...");

                if (heartbeatTimer) { // پاک کردن تایمر هنگام قطع اتصال دستی
                    clearInterval(heartbeatTimer);
                    heartbeatTimer = null;
                    console.log("Heartbeat timer stopped due to manual disconnect.");
                }

                // متد stop یک Promise برمی‌گرداند که ما هم آن را برمی‌گردانیم
                return signalRConnection.stop();
            }
            // اگر اتصالی وجود نداشت، یک Promise حل شده برگردان
            return Promise.resolve();
        },


        /**
         * لیست کاربران یک گروه را به همراه وضعیت آنلاین آنها از سرور دریافت و نمایش می‌دهد.
         * این تابع باید پس از بارگذاری Partial View اعضا فراخوانی شود.
         */
        loadAndDisplayOnlineUsers: function (groupId, groupType) {
            // No longer needs SignalR connection check here as it's an AJAX call
            $.ajax({
                url: '/api/Chat/usersWithStatus', // Matches ChatController route
                type: 'GET',
                data: { groupId: groupId, groupType: groupType },
                success: function (users) {
                    if (users && Array.isArray(users)) { // Ensure users is an array
                        users.forEach(user => {
                            updateUserStatusIcon(user.userId, user.isOnline, parseInt(groupId), groupType); // Ensure groupId is int

                        });
                    } else {
                        console.warn("GetUsersWithStatus AJAX returned no users or invalid format for group " + groupId);
                    }
                },
                error: function (xhr, status, error) {
                    console.error(`Error in GetUsersWithStatus (AJAX) for group ${groupId}:`, status, error, xhr.responseText);
                }
            });
        },

        /**
         * یک پیام متنی به گروه مشخص شده ارسال می‌کند
         * @param {any} groupId 
         * @param {any} messageText
         * @param {any} groupType
         * @param {any} replyToMessageId ایدی پیامی که به ان ریپلای میشود
         * @param {any} fileAttachementIds
         * @param {any} clientMessageId
         */
        sendMessage: function (groupId, messageText, groupType, replyToMessageId, fileAttachementIds, clientMessageId) {

            // اطمینان از اینکه اتصال برقرار است
            if (publicApi.connection && publicApi.connection.state === signalR.HubConnectionState.Connected) {

                // ۱. ساخت آبجکت درخواست مطابق با DTO در سرور
                const request = {
                    GroupId: parseInt(groupId),
                    MessageText: messageText,
                    GroupType: groupType,
                    ReplyToMessageId: replyToMessageId ? parseInt(replyToMessageId) : null,
                    FileAttachementIds: fileAttachementIds && fileAttachementIds.length > 0 ? fileAttachementIds.map(id => parseInt(id)) : [],
                    ClientMessageId: clientMessageId // شناسه موقت کلاینت
                };

                // ۲. فراخوانی متد هاب با استفاده از invoke
                publicApi.connection.invoke("SendMessage", request)
                    .catch(err => {
                        console.error("Error sending message via Hub:", err);
                        // اینجا می‌توانید وضعیت پیام را در UI به "ارسال ناموفق" تغییر دهید
                        updateMessageStatus(clientMessageId, null, 'failed');
                    });
            } else {
                console.error("SignalR connection not established.");
            }

        },

        /**
        * یک پیام موجود را ویرایش می‌کند.
        */
        editMessage: function (messageId, newText, groupId, groupType, fileIds, fileIdsToRemove) {

            if (publicApi.connection && publicApi.connection.state === signalR.HubConnectionState.Connected) {

                const request = {
                    messageId: messageId,
                    messageText: newText,
                    groupId: parseInt(groupId),
                    groupType: groupType,
                    fileAttachementIds: fileIds && fileIds.length > 0 ? fileIds.map(id => parseInt(id)) : [],
                    fileIdsToRemove: fileIdsToRemove && fileIdsToRemove.length > 0 ? fileIdsToRemove.map(id => parseInt(id)) : []
                };

                publicApi.connection.invoke("EditMessage", request)
                    .catch(err => {
                        console.error("Error editing message via Hub:", err);
                        // اینجا می‌توانید وضعیت پیام را در UI به "ارسال ناموفق" تغییر دهید
                        updateEditMessageStatus(messageId, null, 'failed');
                    });
            } else {
                console.error("SignalR connection not established.");
            }


            //$.ajax({
            //    url: '/api/Chat/editMessage',
            //    type: 'POST',
            //    contentType: 'application/json',
            //    data: JSON.stringify(request),
            //    success: function (data) {
            //        // console.log("EditMessage (AJAX) successful for message " + messageId);
            //        updateEditMessageStatus(messageId, data.editMessage, 'sent', data.jsonObject);

            //    },
            //    error: function (xhr, status, error) {
            //        console.error(`Error in EditMessage (AJAX) for message ${messageId}:`, status, error, xhr.responseText);
            //    }
            //});
        },

        /**
        * وضعیت "در حال تایپ" را به سرور اطلاع می‌دهد. (نسخه جدید)
        */
        sendTyping: function (groupId, groupType) {
            if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
                // به جای AJAX از invoke استفاده می‌کنیم
                signalRConnection.invoke("SendTypingSignal", parseInt(groupId), groupType)
                    .catch(err => console.error("Error sending typing signal: ", err));
            }
        },

        /**
         * وضعیت "توقف تایپ" را به سرور اطلاع می‌دهد. (نسخه جدید)
         */
        stopTyping: function (groupId, groupType) {
            if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
                signalRConnection.invoke("SendStopTypingSignal", parseInt(groupId), groupType)
                    .catch(err => console.error("Error sending stop typing signal: ", err));
            }
        },

        /**
         * Marks a message as read by the current user.
         */
        markMessageAsRead: function (groupId, groupType, messageId) {
            if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
                signalRConnection.invoke("MarkMessageAsRead", parseInt(groupId), groupType, parseInt(messageId))
                    .catch(err => console.error("Error marking message as read: ", err));
            }
        },

        /**
         * Marks all message in this group or channel as read by the current user.
         */
        markMarkAllMessagesAsRead: function (groupId, groupType) {
            if (signalRConnection && signalRConnection.state === signalR.HubConnectionState.Connected) {
                signalRConnection.invoke("MarkAllMessagesAsRead", parseInt(groupId), groupType)
                    .catch(err => console.error("Error marking message as read: ", err));
            }
        },

        setScrollListenerActive: function (active) {
            const chatContentScroller = $('#chat_content');
            const newMessagesNotice = $('#newMessagesNotice');

            chatContentScroller.off('scroll.chatApp');
            clearTimeout(scrollTimer);

            if (active) {
                console.log("Scroll listener activated.");
                chatContentScroller.on('scroll.chatApp', function () {
                    var scrollTopLength = chatContentScroller.scrollTop();
                    if (scrollTopLength <= 200 && scrollTopLength > 0 && chatContentScroller.is(':visible')) {
                        getOldData();
                    }

                    const scrollHeight = chatContentScroller.prop("scrollHeight");
                    const clientHeight = chatContentScroller.innerHeight();
                    if (scrollHeight - (scrollTopLength + clientHeight) <= 5) {
                        if (newMessagesNotice.is(':visible')) {
                            newMessagesNotice.hide().data('newCount', 0).text('');
                        }
                    }

                    clearTimeout(scrollTimer);
                    scrollTimer = setTimeout(function () {
                        console.log("Chat scrolled (#chat_content), running global checkVisibleMessages.");
                        checkVisibleMessages();
                    }, 250);
                });
            } else {
                console.log("Scroll listener deactivated.");
            }
        },

        // Expose the new function to be callable from outside, e.g., after AJAX load
        reAttachScrollListener: function () {
            //attachMessageScrollListener();
            publicApi.setScrollListenerActive(true);
        },

        userDeleteMessage: function (groupId, groupType, messageId) {
            // console.log(`publicApi.deleteMessage: Invoked for Group ID: ${groupId}, Type: ${groupType}, Message ID: ${messageId}.`);
            const payload = {
                groupId: parseInt(groupId),
                groupType: groupType,
                messageId: parseInt(messageId)
            };
            $.ajax({
                url: '/api/Chat/deleteMessage',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(payload),
                success: function () {
                    // console.log(`DeleteMessage (AJAX) successful for message ${messageId} in group ${groupId}`);
                    // The actual removal from UI is handled by the "UserDeleteMessage" event from SignalR
                },
                error: function (xhr, status, error) {
                    console.error(`Error in DeleteMessage (AJAX) for message ${messageId} in group ${groupId}:`, status, error, xhr.responseText);
                    // Optionally, provide feedback to the user that deletion failed
                }
            });
        },
        triggerVisibilityCheck: function () {
            // فراخوانی تابع خصوصی از داخل متد عمومی
            console.log("Public API: Manually triggering checkVisibleMessages.");
            checkVisibleMessages();
        },
        triggerUpdateUnreadCountForGroup: function () {
            // فراخوانی تابع خصوصی از داخل متد عمومی
            console.log("Public API: Manually triggering updateUnreadCountForGroup.");
            //updateUnreadCountForGroup();
        },
        // Properties for allowed file extensions
        ALLOWED_IMAGES: [],
        ALLOWED_DOCS: [],
        ALLOWED_AUDIO: [],

        callAlloewExtentions: async function loadFileExtensions() {
            try {
                const response = await fetch('/Home/GetAllowedExtensions');
                if (!response.ok) {
                    throw new Error('Failed to fetch allowed extensions');
                }
                const data = await response.json();

                // به‌روزرسانی متغیرهای عمومی با داده‌های دریافت‌شده
                publicApi.ALLOWED_IMAGES = data.allowedImages || [];
                publicApi.ALLOWED_DOCS = data.allowedDocs || [];
                publicApi.ALLOWED_AUDIO = data.allowedAudio || [];
                console.log("Allowed extensions loaded and set publicly.");

            } catch (error) {
                console.error('Error loading extensions:', error);
                // در صورت خطا، متغیرهای پیش‌فرض خالی می‌مانند
            }
        },

    };

    // این آبجکت عمومی را برمی‌گردانیم تا window.chatApp به آن مقداردهی شود.
    return publicApi;

})(jQuery);


// =================================================
//          APPLICATION INITIALIZATION & DOM EVENTS
// =================================================

$(document).ready(function () {

    //  ماژول چت را راه‌اندازی کن
    window.chatApp.init();


    // ======================================================================
    // مدیریت قطع اتصال هنگام بستن تب یا مرورگر
    // ======================================================================
    // این رویداد زمانی اجرا می‌شود که کاربر قصد خروج از صفحه را دارد
    $(window).on('beforeunload', function () {
        // در این رویداد، مرورگر منتظر تکمیل عملیات غیرهمزمان (async) نمی‌ماند.
        // ما فقط درخواست قطع اتصال را ارسال می‌کنیم (fire-and-forget).
        // مدیریت اصلی قطع اتصال در این سناریو توسط خود سرور SignalR
        // و پس از یک زمان کوتاه (Timeout) انجام می‌شود که کاملاً قابل اطمینان است.
        window.chatApp.disconnect();
    });

    // ####################################################################### Start Audio Recording

    let isRecording = false;
    let isProcessing = false;
    let mediaRecorder;
    let audioChunks = [];
    let recordingTimerInterval = null;
    let pendingVoiceFileId = null;
    let pendingVoiceUrl = null; // برای پخش پیش‌نمایش
    let pendingVoiceAudioElement = null; // برای کنترل پخش
    let currentMimeType = 'audio/webm'; // متغیر جدید برای ذخیره فرمت پشتیبانی شده
    let isAudioProcessing = false;
    let isAjaxProcessing = false;
    // ======================================================================
    //             VOICE RECORDING EVENT HANDLERS
    // ======================================================================


    // تابع اصلی برای مدیریت نمایش UI در حالت‌های مختلف
    function updateChatInputUI(state, data = {}) {
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
            
            <button class="voice-action-btn delete-btn" type="button" title="حذف">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 6H5H21" stroke="#dc3545" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="#dc3545" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            
            <button class="voice-action-btn send-btn" type="button" title="ارسال">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7.39999 6.32003L15.89 3.49003C19.7 2.22003 21.77 4.30003 20.51 8.11003L17.68 16.6C15.78 22.31 12.66 22.31 10.76 16.6L9.91999 14.08L7.39999 13.24C1.68999 11.34 1.68999 8.23003 7.39999 6.32003Z" stroke="#28a745" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        </div>
    </div>`;
                break;
        }

        console.log(html);
        voiceInputArea.html(html);
    }

    // --- توابع اصلی برای کنترل ضبط ---

    function startRecording() {
        if (isRecording || isProcessing) return;

        // 1. بررسی پشتیبانی مرورگر از فرمت‌های مختلف
        if (MediaRecorder.isTypeSupported('audio/ogg')) {
            currentMimeType = 'audio/ogg';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            currentMimeType = 'audio/webm';
        } else {
            alert('متاسفانه مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.');
            console.error('No supported audio formats for MediaRecorder found.');
            return;
        }

        // 2. درخواست دسترسی به میکروفون
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            isRecording = true;
            //$('.btn-record-voice i').removeClass('fa-microphone').addClass('fa-stop');
            changeIcon($('.btn-record-voice'), 'stop');

            updateChatInputUI('recording');

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
                    uploadVoiceFile();
                };
            } catch (err) {
                console.error("خطا در ایجاد MediaRecorder:", err);
                alert("خطا در راه‌اندازی ضبط صدا.");
                isRecording = false; // اطمینان از ریست شدن حالت ضبط
                stream.getTracks().forEach(track => track.stop());
                updateChatInputUI('default');
                cleanupVoiceState();
            }

        }).catch(err => {
            console.error("خطا در دسترسی به میکروفون:", err);
            alert(`خطا در دسترسی به میکروفون: ${err.name} - ${err.message}`);
            isRecording = false;
            updateChatInputUI('default');
        });
    }

    // تابع stopRecording
    function stopRecording() {
        if (!isRecording) return;
        isRecording = false;
        isProcessing = true;
        clearInterval(recordingTimerInterval);
        //$('.btn-record-voice i').removeClass('fa-stop').addClass('fa-microphone');
        changeIcon($('.btn-record-voice'), 'microphone');
        updateChatInputUI('processing');
        // بررسی وجود mediaRecorder قبل از فراخوانی stop
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        } else {
            console.warn('MediaRecorder در حالت ضبط نبود. در حال ریست وضعیت.');
            cleanupVoiceState();
        }
    }

    //بارگذاری فایل صدای ضبط شده
    function uploadVoiceFile() {
        if (audioChunks.length === 0) {
            console.warn('هیچ داده صوتی برای آپلود وجود ندارد.');
            cleanupVoiceState();
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
                addFileIdToHiddenInput(uploadData.fileId, '#uploadedFileIds');

                isProcessing = false;
                updateChatInputUI('preview', {
                    duration: audioData.duration,
                    durationFormatted: audioData.durationFormatted
                });
            })
            .catch(error => {
                console.error("خطا در پردازش فایل صوتی:", error);
                alert(`خطا در پردازش فایل صوتی: ${error}`);
                cleanupVoiceState(true, false); // Clean up, including potential server file
            });
    }


    /**
     * ریست متغیر های ایجاد شده در هنگام ضبط صده
     * @param {any} deleteFromServer : این متغیر مشخص میکند ایا فایل هم حذف شود یا خیر
     */
    function cleanupVoiceState(deleteFromServer = false, voiceWasSent = false) {
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
        if (recordingTimerInterval) clearInterval(recordingTimerInterval);

        // Revoke the URL ONLY if the voice was NOT sent.
        // If it was sent, the blob URL is now in the chat UI.
        if (pendingVoiceUrl && !voiceWasSent) {
            URL.revokeObjectURL(pendingVoiceUrl);
        }

        pendingVoiceFileId = null;
        pendingVoiceUrl = null;
        pendingVoiceAudioElement = null;

        // بازگشت به حالت پیش‌فرض
        updateChatInputUI('default');
        //$('.btn-record-voice i').removeClass('fa-stop').addClass('fa-microphone');
        changeIcon($('.btn-record-voice'), 'microphone');
    }


    // --- مدیریت رویدادها با Event Delegation ---

    // کلیک روی دکمه میکروفون/توقف
    $(document).on('click', '.btn-record-voice', function () {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    $(document).on('click', '.stop-recording-btn', function () {
       
            stopRecording();
        
    });

    // کلیک روی دکمه حذف پیش‌نمایش
    $(document).on('click', '.delete-btn', function () {
        cleanupVoiceState(true, false); // true یعنی از سرور هم حذف کن
    });

    // تابع برای تغییر آیکون
    function changeIcon(button, iconType) {
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

    // مثال
    // تغییر به آیکون توقف
    //changeIcon($('.btn-record-voice'), 'stop');

    // بازگشت به آیکون میکروفون
    //changeIcon($('.btn-record-voice'), 'microphone');


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
    setInterval(() => {
        if (pendingVoiceAudioElement && !pendingVoiceAudioElement.paused) {
            const timeline = $('.voice-timeline');
            if (timeline.length) {
                timeline.attr('max', pendingVoiceAudioElement.duration);
                timeline.val(pendingVoiceAudioElement.currentTime);
            }
        }
    }, 100); // هر 100 میلی‌ثانیه چک کن

    // ####################################################################### End Audio Recording


    //  رویداد کلیک برای دکمه ارسال پیام
    $(document).off('click', '#send-message-button').on('click', '#send-message-button', function () {
        const groupId = parseInt($('#current-group-id-hidden-input').val());
        const groupType = $('#current-group-type-hidden-input').val();

        console.log('groupType==================== ' + groupType);
        // ---- ارسال پیام صوتی ----
        if (pendingVoiceFileId) {

            console.log("ارسال پیام صوتی...");

            // ۱. ساخت شناسه موقت برای پیام
            const clientMessageId = crypto.randomUUID();

            // ۲. ساخت آبجکت فایل صوتی برای نمایش فوری
            const voiceFileObject = {
                fileName: `voice-message.${currentMimeType.split('/')[1]}`,
                fileType: 'audio',
                messageFileId: pendingVoiceFileId, // شناسه موقت فایل تا زمان تایید سرور
                fileThumbPath: pendingVoiceUrl, // <-- کلید اصلی: استفاده از آدرس blob محلی
                fileSize: '' // حجم فعلا مهم نیست
            };

            // ۳. ساخت آبجکت پیام خوش‌بینانه
            const optimisticMessage = {
                messageId: null,
                groupId: groupId,
                groupType: groupType,
                messageText: "", // پیام صوتی متن ندارد
                messageDateTime: new Date().toISOString(),
                senderUserId: parseInt($('#userId').val()),
                senderUserName: $('#fullName').val(),
                profilePicName: $('#userProfilePic').val(),
                clientMessageId: clientMessageId,
                status: 'sending', // نمایش آیکون ساعت
                replyToMessageId: null,
                replyMessage: null,
                messageFiles: [voiceFileObject] // آرایه‌ای حاوی فایل صوتی
            };
            console.log('optimistic message is : ' + optimisticMessage);
            // ۴. نمایش فوری پیام در UI کاربر
            window.chatApp.displayMessage(optimisticMessage);

            // ۵. ارسال پیام به سرور با شناسه فایل صوتی
            window.chatApp.sendMessage(groupId, "", groupType, null, [pendingVoiceFileId.toString()], clientMessageId);

            // ۶. پاکسازی UI ضبط صدا (بدون حذف فایل از سرور)
            cleanupVoiceState(false, true);

            // ۷. ریست کردن فرم اصلی (برای اطمینان)
            resetInputState();
        }
        else {
            console.log("ارسال پیام متنی/فایلی...");

            // ۱. خواندن مقادیر اصلی
            const messageText = $('#message-input').val().trim();
            const fileUploadedIds = collectServerIdsFromContainer('#uploadedFileIds');

            // اگر متنی برای ارسال وجود ندارد و فایلی هم نیست، خارج شو
            if ((!messageText && fileUploadedIds.length === 0) || !(groupId > 0)) {
                return;
            }

            // ۲. خواندن حالت ویرایش یا پاسخ
            const actionType = $('#message-action-type').val();
            const contextId = $('#message-context-id').val();

            // ۳. تصمیم‌گیری بر اساس نوع اکشن
            if (actionType === 'edit') {
                const contextId = parseInt($('#message-context-id').val());
                const messageText = $('#message-input').val();
                const newFileIds = collectServerIdsFromContainer('#uploadedFileIds');
                const deletedFileIds = collectServerIdsFromContainer('#deletUploadedFileIds');
                const previousFileIds = collectServerIdsFromContainer('#previousFileIds');

                // ترکیب لیست نهایی فایل‌ها
                // شروع با فایل‌های قبلی، حذف موارد حذف شده، و سپس اضافه کردن موارد جدید
                const finalFileIds = previousFileIds
                    .filter(id => !deletedFileIds.includes(id))
                    .concat(newFileIds);


                // فراخوانی متد ویرایش در API عمومی
                window.chatApp.editMessage(contextId, messageText, groupId, groupType, finalFileIds, deletedFileIds);

            } else if (actionType === 'reply') {
                // حالت پاسخ: فراخوانی متد ارسال پیام با پارامتر اضافی
                // فرض می‌کنیم متد sendMessage شما یک پارامتر پنجم برای شناسه پیامی که به آن پاسخ داده می‌شود، می‌پذیرد
                console.log(`Replying to message ${contextId} with text: "${messageText}"`);

                //ساخت بدنه پیام فوری
                var messageBlock = $(`.message[data-message-id="${contextId}"]`);
                //var replyMessageText = messageBlock.find('.message-content').text().trim(); // متن پیام اصلی

                var details;
                try {
                    details = JSON.parse(messageBlock.attr('data-message-details'));
                } catch (err) {
                    console.error("خطا در خواندن اطلاعات پیام برای پاسخ در حالت ارسال.", err);
                    return;
                }
                const replyMessageText = details.messageText; // از متن اصلی پیام از data-message-details استفاده کنید
                const replyMessageFiles = details.messageFiles;
                var replySenderName = messageBlock.data('sender-username'); // نام ارسال کننده پیام اصلی

                // 1. اطلاعات مربوط به پیام اصلی که به آن پاسخ داده می شود را آماده کنید
                const replyMessageDetails = {
                    messageText: replyMessageText,
                    senderUserName: replySenderName,
                    messageFiles: replyMessageFiles
                };

                // 2. ساخت پیام خوشبینانه با ارسال `replyToMessageId` و `replyMessageDetails`
                optimisticMessage = createOptimisticMessageBody(
                    groupId, messageText, groupType, parseInt(contextId), replyMessageDetails
                );

                //نمایش فوری پیام در UI  کاربر ارسال کننده
                window.chatApp.displayMessage(optimisticMessage);

                window.chatApp.sendMessage(groupId, messageText, groupType, parseInt(contextId), fileUploadedIds, optimisticMessage.clientMessageId);

            } else {
                // حالت عادی: ارسال یک پیام جدید (کد اصلی شما)
                console.log(`Sending new message: "${messageText}"`);

                /**نمایش پیام بصورت فوری برای ارسال کننده*/
                const optimisticMessage = createOptimisticMessageBody(groupId, messageText, groupType);

                window.chatApp.displayMessage(optimisticMessage);
                window.chatApp.sendMessage(groupId, messageText, groupType, null, fileUploadedIds, optimisticMessage.clientMessageId);
            }

        }
        // ۴. اقدامات پس از ارسال (برای هر سه حالت یکسان است)
        $('#message-input').val(''); // خالی کردن اینپوت
        resetInputState(); // ریست کردن حالت ویرایش/پاسخ و پاک کردن فیلدهای مخفی
        $('#filePreviewContainer').empty(); // کانتینر پیش‌نمایش فایل را خالی کن
        $('#uploadedFileIds').val(''); // شناسه‌های فایل های بارگذاری شده را پاک کن
        $('#deletUploadedFileIds').val(''); // شناسه‌های فایل های حذف شده را پاک کن
        window.chatApp.stopTyping(groupId, groupType); // اطلاع به سرور برای توقف نمایش "در حال تایپ"

    });

    // ساخت پیام برای نمایش فوری
    function createOptimisticMessageBody(groupId, messageText, groupType, replyToMessageId = null, replyMessage = null) {
        console.log('inside createOptimisticMessageBody and grouptype : ' + groupType);
        const filePreviewContainer = $('#filePreviewContainer');
        const messageFiles = [];
        const fileAttachmentIds = [];

        // const _baseUrl = $('#baseUrl').val(); //جهت نمایش تصاویر پیشفرض
        //const demoImagefilePath = `${_baseUrl}assets/media/avatar/demo-img.png`

        console.log("File Preview Container:", filePreviewContainer.length ? "Found" : "Not Found", filePreviewContainer);

        filePreviewContainer.find('.file-preview-item').each(function (index) {
            const $this = $(this);

            // استخراج نام فایل
            const fileNameElement = $this.find('.file-info .file-name');
            const fileName = fileNameElement.text().trim();
            console.log("File Name Element found:", fileNameElement.length ? "Yes" : "No", "Text:", fileName);

            // استخراج مسیر تصویر پیش‌نمایش (برای فایل‌های تصویری)
            const imgElement = $this.find('.file-info .file-thumbnail');
            const fileThumbPath = imgElement.length ? imgElement.attr('src') : '';
            console.log("Image Element found:", imgElement.length ? "Yes" : "No", "src:", fileThumbPath);

            // بررسی وجود آیکون برای فایل‌های غیرتصویری
            const fileIcon = $this.find('.file-info .file-icon');
            console.log("File Icon found:", fileIcon.length ? "Yes" : "No");


            // استخراج حجم فایل
            const fileSizeElement = $this.find('.file-details .file-size');
            let fileSize = 0;
            if (fileSizeElement.length) {
                const fileSizeText = fileSizeElement.text().trim(); // مثال: "28.9 کیلوبایت"
                const sizeMatch = fileSizeText.match(/([\d.]+)\s*(کیلو|مگا)?بایت/);
                if (sizeMatch) {
                    fileSize = parseFloat(sizeMatch[1]) * (sizeMatch[2] === 'مگا' ? 1024 : 1) * 1024; // تبدیل به بایت
                }
            }

            // استخراج شناسه سرور
            const removeButton = $this.find('.remove-file-btn');
            const serverId = removeButton.data('server-id');
            console.log("Remove Button found:", removeButton.length ? "Yes" : "No", "data-server-id:", serverId);

            // تشخیص نوع فایل بر اساس پسوند
            const fileExtension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
            const isImage = ALLOWED_IMAGES.includes(fileExtension);
            const fileType = isImage ? 'image' : 'non-image';
            console.log("File Extension:", fileExtension, "File Type:", fileType);

            // ایجاد شیء FileExtension
            const fileExtensionDto = {
                extension: fileExtension,
                type: fileType,
            };

            //if (fileName && fileThumbPath)
            if (fileName) { // فقط در صورتی اضافه کن که هر دو مقدار موجود باشند
                messageFiles.push({
                    fileName: fileName, //'demo-img.png',
                    fileType: fileType,
                    messageFileId: serverId,
                    fileSize: fileSize,
                    fileThumbPath: fileThumbPath, // استفاده از مقدار خالی یا پیش‌فرض برای فایل‌های غیرتصویری
                    //FileThumbPath: fileThumbPath //demoImagefilePath
                    fileExtension: fileExtensionDto
                });
            } else {
                console.warn(`Skipping file #${index} due to missing fileName or fileThumbPath.`);
            }

            if (serverId) {
                fileAttachmentIds.push(serverId);
            }
        });

        console.log("Final messageFiles array:", messageFiles);
        console.log("Final fileAttachmentIds array:", fileAttachmentIds);


        const clientMessageId = crypto.randomUUID();
        userProfilePic = $('#userProfilePic').val();
        userNameFamily = $('#fullName').val();
        const optimisticMessage = {
            messageId: null,
            groupId: groupId,
            groupType: groupType,
            messageText: messageText,
            messageDateTime: new Date().toISOString(),
            senderUserId: parseInt($('#userId').val()),
            senderUserName: userNameFamily,
            profilePicName: userProfilePic,

            clientMessageId: clientMessageId,
            status: 'sending',

            replyToMessageId: replyToMessageId,
            replyMessage: replyMessage, // <--- اینجا آبجکت replyMessage را مستقیماً پاس می‌دهیم
            messageFiles: messageFiles
        };

        return optimisticMessage;
    }




    //  رویدادهای مربوط به تایپ کردن کاربر
    let typingTimer;
    const TYPING_TIMEOUT = 2000; // ms

    // Typing
    $(document).off('input', '#message-input').on('input', '#message-input', function () {
        const groupId = parseInt($('#current-group-id-hidden-input').val());
        const groupType = $('#current-group-type-hidden-input').val();

        if (groupId > 0) {
            // به محض شروع تایپ، وضعیت را ارسال کن
            window.chatApp.sendTyping(groupId, groupType);

            // تایمر "توقف تایپ" را ریست کن
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                window.chatApp.stopTyping(groupId, groupType)
            }, TYPING_TIMEOUT);
        }
    });

    // actionEditMessage
    $(document).off('click', '.actionEditMessage').on('click', '.actionEditMessage', async function (e) { // <-- Make the handler async
        e.preventDefault();

        // ۱. پاک‌سازی کامل فرم از هر حالت قبلی (مهم)
        resetInputState();

        // ۲. استخراج اطلاعات
        var messageBlock = $(this).closest('.message');
        var messageId = messageBlock.data('message-id');

        var details;
        try {
            details = JSON.parse(messageBlock.attr('data-message-details'));
        } catch (err) {
            console.error("خطا در خواندن اطلاعات پیام برای ویرایش.", err);
            return;
        }

        // ۴. تنظیم حالت ویرایش
        $('#message-action-type').val('edit');
        $('#message-context-id').val(messageId);
        $('#cancel-edit-container').removeClass('force-hide'); // نمایش دکمه "انصراف"

        // ۵. پر کردن فرم با داده‌های پیام
        // پر کردن متن پیام

        const textarea = $('#message-input');
        const text = (details.messageText || '').replace(/<br\s*\/?>/g, '\n');
        textarea.val(text)

        // محاسبه تعداد خطوط
        const lines = text.split('\n').length;

        // تنظیم rows تا حداکثر 5
        textarea.attr('rows', Math.min(lines, 5));
        textarea.focus();

        // اگر پیام در پاسخ بوده، نمایش اطلاعات پاسخ
        if (details.replyToMessageId && details.replyMessage) { // اطمینان از وجود replyToMessageId و replyMessage
            $('#reply-to-user').text('پاسخ به: ' + (details.replyMessage.senderUserName || ''));
            $('#reply-to-text').text(details.replyMessage.messageText || '');
            $('#reply-to-container').show();
        }

        // اگر پیام فایل ضمیمه داشته، پیش‌نمایش آنها را بساز       
        $('#filePreviewContainer').empty(); // ابتدا کانتینر پیش‌نمایش را خالی کنید
        if (details.messageFiles && details.messageFiles.length > 0) {

            // Wait for allowed extensions to be loaded if they haven't been already
            if (window.chatApp.ALLOWED_IMAGES.length === 0) {
                await window.chatApp.callAlloewExtentions();
            }

            previousFileIds = details.messageFiles.map(f => f.messageFileId);

            details.messageFiles.forEach(file => {
                addExistingFileToPreview(file);
                // همچنین، شناسه‌های فایل‌های موجود را به hidden input اضافه کنید تا هنگام ویرایش و ارسال مجدد حفظ شوند
                addFileIdToHiddenInput(file.messageFileId.toString(), '#previousFileIds');
            });
        }


        // اسکرول به پایین صفحه برای دیدن فرم ورودی
        //document.querySelector('#message-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // رویداد کلیک برای دکمه انصراف از ویرایش
    $(document).on('click', '#cancel-edit-button', function () {
        resetInputState();
    });


    // actionReplyMessage
    $(document).off('click', '.actionReplyMessage').on('click', '.actionReplyMessage', function (e) {
        e.preventDefault();
        resetInputState();

        // همیشه تمام کانتینرهای پیش‌نمایش را قبل از استفاده پاک می‌کنیم
        $('#reply-thumbnail-container').empty();
        $('#reply-icon-container').empty();

        const messageBlock = $(this).closest('.message');
        const messageId = $(this).data('messageid');
        const senderName = messageBlock.data('sender-username');
        const messageDetailsStr = messageBlock.attr('data-message-details');

        let previewText = 'پیام'; // متن پیش‌فرض

        if (messageDetailsStr) {
            try {
                const messageDetails = JSON.parse(messageDetailsStr);
                const hasText = messageDetails.messageText && messageDetails.messageText.trim() !== '';
                const hasFiles = messageDetails.messageFiles && messageDetails.messageFiles.length > 0;

                // اگر پیام متن داشت، همیشه متن در اولویت است
                if (hasText) {
                    previewText = messageDetails.messageText;
                }
                // اگر متن نداشت ولی فایل داشت، نوع فایل را تشخیص می‌دهیم
                else if (hasFiles) {
                    const firstFile = messageDetails.messageFiles[0];
                    const fileName = firstFile.originalFileName || firstFile.fileName || '';
                    const fileExtension = fileName.split('.').pop().toLowerCase();

                    // 1. بررسی برای فایل صوتی (راه حل پایدار)
                    // ما 'webm' را مستقیماً چک می‌کنیم و همچنین لیست برنامه را هم در نظر می‌گیریم
                    if (fileExtension === 'webm' || (window.chatApp.ALLOWED_AUDIO && window.chatApp.ALLOWED_AUDIO.includes(fileExtension))) {
                        $('#reply-icon-container').html(' <img src="/chatzy/assets/iconsax/music-filter.svg" />');
                        previewText = 'فایل صوتی';
                    }
                    // 2. بررسی برای فایل تصویر
                    else if (window.chatApp.ALLOWED_IMAGES && window.chatApp.ALLOWED_IMAGES.includes(fileExtension)) {
                        const baseUrl = $('#baseUrl').val() || '';
                        const imageUrl = baseUrl + (firstFile.fileThumbPath || firstFile.filePath);
                        $('#reply-thumbnail-container').html(`<img src="${imageUrl}" class="reply-preview-thumbnail" alt="پیش‌نمایش">`);
                        previewText = 'عکس';
                    }
                    // 3. سایر فایل‌ها (داکیومنت و...)
                    else {
                        $('#reply-icon-container').html(' <img src="/chatzy/assets/iconsax/paperclip-2.svg" />');
                        previewText = fileName || 'فایل پیوست‌شده';
                    }
                }
            } catch (err) {
                console.error("خطا در خواندن data-message-details:", err);
                previewText = messageBlock.find('.message-box-details h5').text().trim() || 'پیام';
            }
        } else {
            previewText = messageBlock.find('.message-box-details h5').text().trim() || 'پیام';
        }

        // تنظیم اطلاعات و نمایش پنل
        $('#reply-to-user').text('پاسخ به: ' + senderName);
        $('#reply-to-text').text(previewText);
        $('#reply-to-container').show();

        // رندر کردن آیکون جدید (اگر از کتابخانه iconsax استفاده می‌کنید)
        if (typeof init_iconsax === 'function') {
            init_iconsax();
        }

        // تنظیم حالت پاسخ برای فرم
        $('#message-context-id').val(messageId);
        $('#message-action-type').val('reply');

        $('#message-input').val('').focus();
    });

    // actionSaveMessage
    $(document).off('click', '.actionSaveMessage').on('click', '.actionSaveMessage', function (e) {
        e.preventDefault();
        const groupId = $('#current-group-id-hidden-input').val();
        const groupType = $('#current-group-type-hidden-input').val();
        var messageId = $(this).data('messageid');
        console.log("در حال ذخیره پیام با شناسه: " + messageId);

        // ارسال درخواست ایجکس به کنترلر برای ذخیره پیام
        $.ajax({
            url: '/Home/SaveMessage', // آدرس کنترلر خود را جایگزین کنید
            type: 'POST',
            data: { messageId: messageId },
            success: function (response) {
                if (response.success) {
                    alert('پیام با موفقیت ذخیره شد!');
                } else {
                    alert('خطا در ذخیره پیام: ' + response.message);
                }
            },
            error: function () {
                alert('خطای ارتباط با سرور.');
            }
        });
    });

    // actionDeleteMessage  
    $(document).off('click', '.actionDeleteMessage').on('click', '.actionDeleteMessage', function (e) {
        e.preventDefault();
        const groupId = parseInt($('#current-group-id-hidden-input').val()); //$('#current-group-id-hidden-input').val();
        const groupType = $('#current-group-type-hidden-input').val();
        var messageId = $(this).data('messageid');
        const currentUserId = parseInt($('#userId').val());
        const senderId = parseInt($(this).data('sender-id'));
        var request = { MessageId: messageId, ClassGroupId: groupId, ClassGroupType: groupType };
        console.log("در حال حذف پیام با شناسه: " + messageId);

        window.chatApp.userDeleteMessage(groupId, groupType, messageId);

    });

    // actionDeleteSavedMessage
    $(document).off('click', '.actionDeleteSavedMessage').on('click', '.actionDeleteSavedMessage', function (e) {
        e.preventDefault();
        const groupId = $('#current-group-id-hidden-input').val();
        const groupType = $('#current-group-type-hidden-input').val();
        var messageSavedId = $(this).data('messagesavedid');
        console.log("در حال حذف پیام ذخیره شده با شناسه: " + messageSavedId);

        // ارسال درخواست ایجکس به کنترلر برای ذخیره پیام
        $.ajax({
            url: '/Home/DeleteSavedMessage', // آدرس کنترلر خود را جایگزین کنید
            type: 'POST',
            data: { messageSavedId: messageSavedId },
            success: function (response) {
                if (response.success) {
                    const messageSaveIdToRemove = "#message-" + messageSavedId;
                    $(messageSaveIdToRemove).remove();
                    alert('با موفقیت حذف شد!');
                } else {
                    alert('خطا در حذف پیام ذخیره شده: ' + response.message);
                }
            },
            error: function () {
                alert('خطای ارتباط با سرور.');
            }
        });
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
        $('#filePreviewContainer').removeClass('visible');
        $('#filePreviewContainer').empty();
        $('#uploadedFileIds').val('');
        $('#previousFileIds').val('');
        $('#deletUploadedFileIds').val('');

    }

 
    // رویداد کلیک روی اعلان پیام جدید و رفتن به جدید ترین پیام
    $(document).off('click', '#newMessagesNotice').on('click', '#newMessagesNotice', function () {
        const chatFinished = $('#chat-finished');
        chatFinished[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // 1. لیسنر اسکرول را به طور کامل غیرفعال کن
        window.chatApp.setScrollListenerActive(false); //

        // 2. اسکرول را انجام بده
        chatFinished[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // 3. اعلان را مخفی کن
        $(this).hide().data('newCount', 0).text('');

        // 4. پرچم را تنظیم کن تا checkVisibleMessages غیرفعال بماند
        isMarkingAllMessagesAsRead = true;

        // 5. درخواست علامت‌گذاری همه پیام‌ها را به سرور بفرست
        const currentGroupIdForCheck = parseInt($('#current-group-id-hidden-input').val());
        const currentGroupTypeForCheck = $('#current-group-type-hidden-input').val();
        window.chatApp.markMarkAllMessagesAsRead(currentGroupIdForCheck, currentGroupTypeForCheck);

    });


    // ریسایز شدن صفحه و فراخوانی لیسنر برای مشاهده پیامها- جهت مریدیت خوانده نشده ها
    let resizeTimer;
    $(window).on('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            console.log("Window resized, running visibility check.");
            window.chatApp.triggerVisibilityCheck();
        }, 250); // با یک تأخیر 250 میلی‌ثانیه‌ای اجرا شود
    });

    //===============================================================
    //  =====>  اضافه کردن لیسنر برای فعال شدن تب مرورگر  <=====
    //===============================================================
    document.addEventListener('visibilitychange', function () {
        // اگر صفحه از حالت مخفی به حالت قابل مشاهده تغییر کرد
        if (!document.hidden) {
            console.log("Tab became visible, running visibility check.");
            // یک تأخیر کوتاه برای اطمینان از رندر مجدد صفحه
            setTimeout(function () {
                window.chatApp.triggerVisibilityCheck();
            }, 250);
        }
    });

    // جمع آوری ایدی فایلهای ارسالی که کاربر بارگذاری کرده و از سمت سرور ایدی دریافت شده
    function collectServerIdsFromContainer(containerSelector) {

        const hiddenInput = $(containerSelector);
        const value = hiddenInput.val();

        if (!value || value.trim() === "") return [];

        return value
            .split(',')
            .map(id => parseInt(id))
            .filter(id => !isNaN(id));

    }

    $(document).on('click', '.exit-tab-btn', function () {
        console.log("Announcing user presence to the main API...");
        $.post("/account/logout", function (response) {
            // پاسخ سرور
            console.log("خروج با موفقیت انجام شد:", response);
            // می‌توانید صفحه را به آدرس دیگری هدایت کنید یا کار دیگری انجام دهید
            window.location.href = "/"; // مثلاً هدایت به صفحه اصلی
        }).fail(function (error) {
            console.error("خطا در خروج:", error);
        });
    });


    /**
     * وقتی کاربر در ورودی اینتر را زد ارسال پیام فراخوانی شود
     * و اگر اینتر بهمراه کنترل بود به خط بعدی برود
     */

    // تابع برای تنظیم پویای ویژگی rows
    function adjustTextareaRows($textarea) {
        const text = $textarea.val();
        const lineCount = (text.match(/\n/g) || []).length + 1; // تعداد خطوط
        const maxRows = 5; // حداکثر تعداد سطرها
        const newRows = Math.min(lineCount, maxRows); // محدود به 5 سطر
        $textarea.attr('rows', newRows);
        console.log('Line count:', lineCount, 'New rows:', newRows);
    }

    // رویداد keydown برای message-input
    $(document).off('keydown', '#message-input').on('keydown', '#message-input', function (event) {
        console.log('Keydown event fired. Key:', event.key, 'Ctrl:', event.ctrlKey, 'Value before:', $(this).val());
        if (event.key === 'Enter') {
            if (event.ctrlKey) {
                console.log('Ctrl + Enter: Adding new line');
                const $textarea = $(this);
                const currentText = $textarea.val();
                const cursorPos = $textarea[0].selectionStart;
                const newText = currentText.substring(0, cursorPos) + '\n' + currentText.substring(cursorPos);
                $textarea.val(newText);
                $textarea[0].selectionStart = $textarea[0].selectionEnd = cursorPos + 1;
                console.log('Value after:', $textarea.val());
                adjustTextareaRows($textarea); // تنظیم rows بعد از افزودن خط جدید
                return;
            } else {
                console.log('Enter: Submitting');
                event.preventDefault();
                event.stopPropagation();
                const sendButton = $('#send-message-button');
                console.log('Send button element:', sendButton.length ? sendButton : 'Not found');
                if (sendButton.length) {
                    sendButton.trigger('click');
                } else {
                    console.error('Send button not found!');
                }
            }
        }
    });

    // رویداد input برای تنظیم rows و تایپ
    $(document).off('input', '#message-input').on('input', '#message-input', function (event) {
        console.log('Input event fired. InputType:', event.originalEvent?.inputType);
        adjustTextareaRows($(this)); // تنظیم rows در هر تغییر
        if (event.originalEvent?.inputType === 'insertLineBreak') {
            console.log('Input event ignored for line break');
            return;
        }
        const groupId = parseInt($('#current-group-id-hidden-input').val());
        const groupType = $('#current-group-type-hidden-input').val();
        if (groupId > 0) {
            window.chatApp.sendTyping(groupId, groupType);
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                window.chatApp.stopTyping(groupId, groupType);
            }, TYPING_TIMEOUT);
        }
    });


});