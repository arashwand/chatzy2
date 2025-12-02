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
    let hasMoreMessages = true;

    // متغیرهای جدید برای مدیریت بار اول لود
    let isInitialLoad = true;
    let isLoadingAroundMessage = false; // پرچم برای بارگذاری دور پیام هدف

    // =================================================
    //               PRIVATE METHODS
    // =================================================
    // این توابع، عملیات داخلی ماژول را انجام می‌دهند.


    /**
    * یک پیام را به صورت بصری به چت اضافه می‌کند.
    * این تابع مسئول ایجاد کانتینر تاریخ در صورت نیاز است.
    * @param {object} message - شیء کامل پیام.
    * @param {boolean} prepend - اگر true باشد، پیام به ابتدای لیست اضافه می‌شود (برای پیام‌های قدیمی).
    * @returns {jQuery} - عنصر jQuery پیام که به DOM اضافه شده است.
    */
    function addMessageToUI(message, prepend = false) {
        const chatContent = $('#Message_Days');
        if (!chatContent.length) {
            console.error("Main message container (#Message_Days) not found.");
            return null;
        }

        const messageDate = new Date(message.messageDateTime); // یا messageDate
        const dateStr = formatDate(messageDate);
        const dateId = `date-${dateStr}`;

        let dateContainer = chatContent.find(`.message-box-list[data-message-date="${dateId}"]`);

        // اگر کانتینر برای این تاریخ وجود نداشت، هدر و کانتینر پیام را بساز
        if (!dateContainer.length) {
            const persianDate = convertGregorianToJalaaliSimple(dateStr); // فرض بر وجود این تابع است
            const newDateHeaderHtml = `<h6 class="fw-normal text-center heading chatInDateLabelClass" data-label="${persianDate}" id="${dateId}">${persianDate}</h6>`;
            const newDateContainerHtml = `<div class="message-box-list" data-message-date="${dateId}"></div>`;

            // اگر پیام قدیمی است (prepend)، هدر و کانتینر را در بالا اضافه کن
            if (prepend) {
                chatContent.prepend(newDateContainerHtml);
                chatContent.prepend(newDateHeaderHtml);
            } else { // در غیر این صورت (پیام جدید)، آن‌ها را در پایین اضافه کن
                chatContent.append(newDateHeaderHtml);
                chatContent.append(newDateContainerHtml);
            }
            // کانتینر جدید را پیدا کن
            dateContainer = chatContent.find(`.message-box-list[data-message-date="${dateId}"]`);
        }

        const $messageBody = $(createMessageHtmlBody(message));

        // پیام را به کانتینر تاریخ مربوطه اضافه کن
        if (prepend) {
            // پیام‌های قدیمی را در ابتدای کانتینر اضافه کن
            dateContainer.prepend($messageBody);
        } else {
            // پیام‌های جدید را به انتهای کانتینر اضافه کن
            dateContainer.append($messageBody);
        }

        return $messageBody;
    }



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
    function getOldData(targetMessageId = null, loadBothDirections = false) {

        console.log('hasMoreMessages : ' + hasMoreMessages + ' and getOldDataRunning is: ' + getOldDataRunning);
        console.log('targetMessageId: ' + targetMessageId + ', loadBothDirections: ' + loadBothDirections);

        if (getOldDataRunning) {
            console.log('getOldData is already running');
            return;
        }

        // اگر targetMessageId داریم، حول آن بارگذاری کن (نه فقط قدیمی‌ها)
        if (targetMessageId && loadBothDirections) {
            if (isLoadingAroundMessage) {
                console.log('Already loading around a target message');
                return;
            }
            isLoadingAroundMessage = true;
            getOldDataRunning = true;

            const chatId = parseInt($('#current-group-id-hidden-input').val());
            const currentGroupType = $('#current-group-type-hidden-input').val();

            console.log(`Loading 50 messages around message ID: ${targetMessageId}`);

            $.ajax({
                url: '/Home/GetOldMessage',
                type: 'POST',
                data: {
                    chatId: chatId,
                    groupType: currentGroupType,
                    messageId: targetMessageId,
                    loadOlder: false, // false = بارگذاری دور این پیام، نه فقط قدیمی‌ها
                    loadBothDirections: true // 25 قدیمی + 25 جدید
                },
                success: function (response) {
                    if (response.success && response.data.length > 0) {
                        console.log(`Loaded ${response.data.length} messages around target message`);
                        
                        // ابتدا تمام پیام‌ها را بارگذاری کن
                        groupMessagesByDate(response.data);

                        // سپس به پیام هدف اسکرول کن
                        setTimeout(() => {
                            const targetElement = $(`#message-${targetMessageId}`);
                            if (targetElement.length) {
                                const chatContent = $('#chat_content');
                                const elementTop = targetElement.offset().top - chatContent.offset().top + chatContent.scrollTop();
                                chatContent.scrollTop(elementTop - 100); // تا حدی بالاتر برای دیدن کامل
                                
                                // Highlight پیام هدف
                                targetElement.addClass('highlight-message');
                                setTimeout(() => {
                                    targetElement.removeClass('highlight-message');
                                }, 2000);
                            }
                        }, 100);

                    } else {
                        console.log('No messages found around target message');
                    }
                },
                complete: function () {
                    getOldDataRunning = false;
                    isLoadingAroundMessage = false;
                },
                error: function (xhr, status, error) {
                    console.log('Error loading messages around target: ' + error);
                    isLoadingAroundMessage = false;
                }
            });

            return; // از اجرای کد پایین‌تر جلوگیری کن
        }

        // ---- کد اصلی برای بارگذاری قدیمی‌تر در حین اسکرول ----
        if (!hasMoreMessages) {
            console.log('No more messages to load');
            return;
        }

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
            data: {
                chatId: chatId,
                groupType: currentGroupType,
                messageId: lastmessageId,
                loadOlder: true, // true = فقط قدیمی‌تر
                loadBothDirections: false
            },
            success: function (response) {
                if (response.success) {
                    
                    if (response.data.length < 50) {
                        hasMoreMessages = false;
                    }

                    if (response.data.length > 0) {
                        groupMessagesByDate(response.data);
                        var lastMessageIdRecived = parseInt(response.lastMessageId);
                        $('#lastMessageIdLoad').val(lastMessageIdRecived);
                    }

                    console.log('Messages loaded successfully!');

                } else {
                    console.log('Error loading old messages: ' + response.message);
                }
            },
            complete: function () {
                getOldDataRunning = false;
            },
            error: function () {
                console.log('Network error while loading messages.');
            }
        });
    }

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`; // خروجی مثال: 2025-05-26
    }

    // تبدیل تاریخ به ساعت و دقیقه 
    function convertDateTohhmm(dateTime) {
        console.log('input datetime is : ' + dateTime);
        const date = new Date(dateTime);

        if (isNaN(date)) {
            return dateTime; // بازگرداندن مقدار اصلی اگر تاریخ نامعتبر بود
        }

        // نمایش زمان محلی با فرمت 24 ساعته
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    /**
    * پیامهای قدیمی دریافت شده را در بالا اضافه میکند
    * @param {any} messages
    */
    function groupMessagesByDate(messages) {
        // مرتب‌سازی پیام‌ها بر اساس زمان (از قدیم به جدید) تا به ترتیب درست prepend شوند
        //messages.sort((a, b) => new Date(a.messageDateTime) - new Date(b.messageDateTime));

        // به ازای هر پیام، آن را با استفاده از تابع مرکزی به UI اضافه کن
        messages.forEach(function (message) {
            addMessageToUI(message, true); // true یعنی به ابتدا اضافه شود (prepend)
        });

        // پس از افزودن تمام پیام‌ها، آیکون‌ها را یکجا رندر کن
        if (typeof init_iconsax === 'function') {
            init_iconsax();
        }
    }


    /** زمانی که کاربر پیامی را ارسال میکند 
     * بلافاصله در گروه بصورت ارسال نشده نمایش میدهیم
     *  و بعد از ارسال موفق اپدیت میشود
     */
    function createMessageHtmlBody(message, edited = false) {
        const isSelf = (currentUser == message.senderUserId);
        const liClass = isSelf ? 'personal' : 'new';
        const systemClass = message.isSystemMessage ? ' systemMessage' : '';
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

        // Pin/unpin: only show when current user role is allowed
        try {
            const userRole = $('#userRoleName').val() || '';
            const allowedRoles = ['Teacher', 'Personel', 'Manager'];
            if (allowedRoles.includes(userRole)) {
                const isPinned = !!message.isPin; // expects message.isPin (camelCase from server)
                const pinText = isPinned ? 'لغو سنجاق' : 'سنجاق';
                const pinIcon = '/chatzy/assets/iconsax/pin-1.svg';
                dropdownHtml += `
                <a class="dropdown-item d-flex align-items-center actionPinMessage" data-messageid="${messageId}" data-is-pinned="${isPinned ? 'true' : 'false'}" href="#" aria-label="Pin message">
                    <img src="${pinIcon}" class="svgInvertColor" />&nbsp;
                    <span class="pin-text">${pinText}</span>
                </a>`;
            }
        } catch (err) {
            console.warn('Error while determining user role for pin option:', err);
        }

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
            filesHtml += '<div class="row mt-1 overflow-hidden">';
            message.messageFiles.forEach(file => { filesHtml += createDisplayFileBody(file, isSelf); });
            filesHtml += '</div>';
        }

        const messageTextHtml = message.messageText ? message.messageText.replace(/\n/g, '<br />') : '';
        const editedIndicator = edited ? ` <small class="text-muted fst-italic">(ویرایش شده)</small>` : '';

        let senderName = '';
        let timingHtml = `<div class="timing"><h6>${convertDateTohhmm(message.messageDateTime)}</h6>`;
        if (isSelf) {
            if (message.status === 'sending') {
                timingHtml += '🕒';
            } else {
                timingHtml += `<img class="img-fluid tick" src="/chatzy/assets/images/svg/tick.svg" alt="tick" style="display: ${message.isReadByAnyRecipient ? "none" : "inline"};">
                           <img class="img-fluid tick-all" src="/chatzy/assets/images/svg/tick-all.svg" alt="tick" style="display: ${message.isReadByAnyRecipient ? "inline" : "none"};">`;
            }
        }

        if (!isSelf) {
            timingHtml += `<h6>${message.senderUserName}</h6>`;
        }

        timingHtml += '</div>';

        let personImageHtml = '';
        if (!isSelf) {
            personImageHtml = `<img class="img-fluid person-img" src="/assets/media/avatar/${message.profilePicName || 'UserIcon.png'}" alt="p9">`;
        }

        return `
        <li class="message ${liClass}${systemClass}" id="${elementId}" data-message-id="${messageId}" data-client-id="${message.clientMessageId || ''}" data-sender-id="${message.senderUserId}" data-sender-username="${message.senderUserName}" data-message-details='${messageDetailsJson}' data-is-read="${message.isReadByAnyRecipient ? 'true' : 'false'}">
            ${dropdownHtml}
            <div class="message-box ${message.isReadByAnyRecipient ? "read" : ""}">
                ${personImageHtml}
                <div class="message-box-details">
                    ${replyPreviewHtml}
                    <h5>${messageTextHtml}${editedIndicator}</h5>
                    ${filesHtml}
                    ${timingHtml}
                    ${senderName}
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
                   <img class="img-thumbnail chat-thumbnail"  src="${finalPath}" data-original-filename="${file.originalFileName || file.fileName}" alt="${file.fileName}" style="max-height:150px; cursor:pointer;">

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
                             <i class="iconsax" data-icon="download"></i>
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
                        <img src="/chatzy/assets/iconsax/download.svg" class="download-icon" style="cursor:pointer; margin-top: 5px; width: 24px; height: 24px;" alt="download">
                        <img src="/chatzy/assets/iconsax/spinner.svg" class="spinner-icon" style="display: none; width: 24px; height: 24px;" alt="loading">
                    </span>
            </div>`;

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

        if (specificMessageElement && specificMessageElement.length && specificMessageElement.attr('data-is-read') !== 'true') {
            processSingleMessage(specificMessageElement);
        } else if (!specificMessageElement) {
            // انتخاب پیام‌های خوانده‌نشده که از کاربر جاری نیستند
            const unreadMessages = chatContent.find('.message:not([data-is-read="true"])').filter(function () {
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
        let isSelf = (currentUserId === message.senderUserId);

        // بررسی پیام سیستم
        if (message.isSystemMessage) {
            message.senderUserName = "systembot";
            isSelf = false;
        }

        console.log('activeGroup :' + activeGroupId + ' currentUserId: ' + currentUserId + ' isSelf: ' + isSelf);

        // ۱. به‌روزرسانی پیش‌نمایش آخرین پیام در سایدبار
        const chatTextElement = document.getElementById(`chatText_${message.groupType}_${message.groupId}`);
        const chatTimeElement = document.getElementById(`chatTime_${message.groupType}_${message.groupId}`);
        console.log(`Trying to update preview for group ${message.groupType}_${message.groupId}, chatTextElement found: ${!!chatTextElement}, chatTimeElement found: ${!!chatTimeElement}`);
        if (chatTextElement && chatTimeElement) {
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

            const messageDate = new Date(message.messageDate);
            console.log('message date is : ' + messageDate);
            const dateStr = formatDate(messageDate); // خروجی: "YYYY-MM-DD"
            console.log('dateStr is : ' + dateStr);
            let messageList = $(`#chatMessages-${dateStr}`);

            // <<<< شروع تغییرات >>>>
            // اگر کانتینر پیام برای این تاریخ وجود نداشت، آن را بساز
            if (!messageList.length) {

                // 1. تعریف تاریخ امروز و دیروز برای مقایسه
                const today = new Date();
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);

                const todayStr = formatDate(today);
                const yesterdayStr = formatDate(yesterday);

                let dateLabel = '';

                // 2. انتخاب هوشمندانه برچسب تاریخ
                switch (dateStr) {
                    case todayStr:
                        dateLabel = "امروز";
                        break;
                    case yesterdayStr:
                        dateLabel = "دیروز";
                        break;
                    default:
                        // استفاده از toLocaleDateString برای نمایش تاریخ کامل فارسی
                        dateLabel = messageDate.toLocaleDateString('fa-IR', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        });
                        break;
                }

                // 3. ساخت HTML صحیح با برچسب جدید و شناسه یکتا برای هدر
                const headerId = `date-${dateStr}`; // شناسه برای تگ h6
                const newDayHtml = `
                <h6 class="fw-normal text-center heading chatInDateLabelClass" data-label="${dateLabel}" id="${headerId}">${dateLabel}</h6>
                <ul class="message-box-list" id="chatMessages-${dateStr}"></ul>`;

                // <<<< پایان تغییرات >>>>

                $('#Message_Days').append(newDayHtml);
                messageList = $(`#chatMessages-${dateStr}`); // انتخاب مجدد لیست تازه ایجاد شده
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
    function updateUserStatusIcon(userId, isOnline) {
        // Find the specific member's status container by the new ID
        const memberStatusElement = $(`#member-status-${userId}`);

        if (memberStatusElement.length > 0) {
            // Add or remove the 'online' class based on the status
            memberStatusElement.toggleClass('online', isOnline);
            //console.log(`User ${userId} status updated to: ${isOnline ? 'Online' : 'Offline'}`);

            // پیدا کردن h6 مربوطه در همان parent
            const statusTextElement = memberStatusElement.closest('.member-details').find('.status-online');

            // تغییر متن و آیکن
            const newText = isOnline ? 'Online' : 'Offline';
            const newIcon = isOnline ? '/chatzy/assets/images/svg/smiling-eyes.svg'
                : '/chatzy/assets/images/svg/smile.svg';

            statusTextElement.html(`${newText} <img src="${newIcon}" alt="status-icon">`);

            console.log(`User ${userId} status updated to: ${newText}`);
        }
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


    // بروزرسانی وضعیت دیده شدن پیام با تعداد دیده‌ها
    function handleMessageSeenUpdate(messageId, readerUserId, seenCount, readerFullName) {
        console.log('handleMessageSeenUpdate called with messageId:', messageId, 'readerUserId:', readerUserId, 'seenCount:', seenCount, 'readerFullName:', readerFullName);
        const messageElement = $('#message-' + messageId);
        if (messageElement.length && messageElement.data('sender-id') == currentUser) {
            if (seenCount > 0) {
                const timingElement = messageElement.find('.timing');
                timingElement.find('.tick').hide();
                timingElement.find('.tick-all').show();
                // بروزرسانی title با نام خواننده
                const currentTitle = timingElement.attr('title') || 'خوانده شده توسط:';
                if (!currentTitle.includes(readerFullName)) {
                    timingElement.attr('title', currentTitle + ' ' + readerFullName);
                }
            }
        }
    }

    function handlerUpdatePinMessage(messageId, messageText, isPin) {
        console.log('handlerUpdatePinMessage called with messageId:', messageId, 'isPin:', isPin);

        const pinnedContainer = $('.pinned-messages-container');
        const pinnedList = $('.pinned-messages-list');

        // بررسی وجود کانتینر پیام‌های پین شده
        if (!pinnedContainer.length || !pinnedList.length) {
            console.warn('Pinned messages container not found!');
            return;
        }

        if (isPin) {
            // اگر پیام باید پین شود، آن را اضافه کن
            // ابتدا متن پیام را از DOM پیدا کن
            const messageElement = $(`#message-${messageId}`);
            if (!messageElement.length) {
                console.warn(`Message element not found for messageId: ${messageId}`);
                return;
            }


            // بررسی کن که آیا این پیام قبلاً پین شده است
            const existingItem = pinnedList.find(`.pinned-message-item[data-message-id="${messageId}"]`);
            if (existingItem.length) {
                console.log(`Message ${messageId} is already pinned.`);
                return;
            }

            // ایجاد عنصر جدید برای پیام پین شده
            const newPinnedItem = `
                <li class="pinned-message-item" data-message-id="${messageId}" style="position: relative; padding-left: 20px; margin-bottom: 0; cursor: pointer;">
                    <span class="borderPinMessage"></span>
                    <span class="pinMessageText">${messageText}</span>
                </li>
            `;

            // اضافه کردن عنصر جدید به لیست
            pinnedList.append(newPinnedItem);
            console.log(`Message ${messageId} added to pinned messages.`);

            // نمایش کانتینر اگر پنهان بود
            pinnedContainer.show();

            // اسکرول به آخرین پیام پین شده
            pinnedContainer.scrollTop(pinnedContainer[0].scrollHeight);

        } else {
            // اگر پیام باید از حالت پین خارج شود، آن را حذف کن
            const pinnedItem = pinnedList.find(`.pinned-message-item[data-message-id="${messageId}"]`);
            if (pinnedItem.length) {
                // انیمیشن حذف
                pinnedItem.fadeOut(300, function () {
                    $(this).remove();

                    // اگر دیگر پیام پین شده‌ای وجود نداشت، کانتینر را پنهان کن
                    if (pinnedList.find('.pinned-message-item').length === 0) {
                        pinnedContainer.fadeOut(300, function () {
                            $(this).hide();
                        });
                    }
                });
                console.log(`Message ${messageId} removed from pinned messages.`);
            } else {
                console.warn(`Pinned message item not found for messageId: ${messageId}`);
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


    // ... کد موجود شما ...

    function handleDeleteMessage(messageId, result) {
        console.log('indide UserDeleteMessage ' + messageId + ' and result is :' + result);
        // نتیجه را پردازش میکنیم اگر موفق بود حذف میشود و اگر ناموفق بود به کاربر پیام نمایش داده میشود
        const messageElement = $('#message-' + messageId);
        if (result === true) {
            if (messageElement.length) {
                // اضافه کردن کلاس removing برای شروع انیمیشن
                messageElement.addClass('removing');

                // بعد از پایان انیمیشن (0.5 ثانیه)، عنصر را حذف کنید
                setTimeout(() => {
                    messageElement.remove();
                }, 500); // زمان باید با duration انیمیشن همخوانی داشته باشد
            }
        } else {
            console.log('result from hub to handleDeleteMessage has error')
        }
    }

    // ... کد موجود شما ...

    //function handleUserSaveMessage(messageId, result) {
    //    console.log('result from hub to handleUserSaveMessage')
    //    // نتیجه را پردازش میکنیم اگر موفق بود حذف میشود و اگر ناموفق بود به کاربر پیام نمایش داده میشود
    //    const messageElement = $('#message-' + messageId);
    //    if (result === true) {
    //        console.log('result equal true')
    //        if (messageElement.length) {
    //            messageElement.addClass('removing');
    //            setTimeout(() => {
    //                messageElement.remove();
    //            }, 400);
    //        }
    //    } else {
    //        console.log('result from hub to handleUserSaveMessage has error')
    //    }
    //}

    function makeJsonObjectForMessateDetails(message) {
        try {
            console.log('inside makeJsonObjectForMessateDetails ******************************' + message)
            // بررسی وجود آبجکت message و خواص اصلی آن
            if (!message || !message.messageText) {
                // throw new Error("Invalid message object: messageText is missing.");
                console.log('پیام حاوی متن نیست.درنتیجه احتمالا فایل صوتی است و یا فالهای دیگر')
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
    * تاریخ و زمان کامل میگیره و ساعت و دقیقه بر میگردونه
    * @param {any} isoString
    * @returns
    */
    function extractTime(isoString) {
        const date = new Date(isoString);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }


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

            const time = extractTime(savedMessage.messageDateTime);

            // تغییر آیکون وضعیت از "ساعت" به "تیک"  
            if (timingElement.length) {
                timingElement.html(`
                    <h6>${time}</h6>    
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
                console.log("Displaying message received on handler :", message);
                if (message.senderUserId !== currentUser) {
                    displayMessage(message);
                } else if (message.isSystemMessage) {
                    console.log("-------------------message receive from portal-------------------");
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

            signalRConnection.on("MessageSeenUpdate", handleMessageSeenUpdate);

            signalRConnection.on("UpdatePinMessage", function (data) {
                console.log("UpdatePinMessage received:", data);
                handlerUpdatePinMessage(data.messageId, data.messageText, data.isPin);
            });

            signalRConnection.on("MessageSuccessfullyMarkedAsRead", handleMessageSuccessfullyMarkedAsRead);
            signalRConnection.on("AllUnreadMessagesSuccessfullyMarkedAsRead", handleAllUnreadMessageSuccessfullyMarkedAsRead);
            signalRConnection.on("UserDeleteMessage", handleDeleteMessage);
            //signalRConnection.on("UserSaveMessage", handleUserSaveMessage);

            signalRConnection.on("ReceiveVoiceMessageResult", function (data) {
                console.log("ReceiveVoiceMessageResult received:", data);

                if (data.success && data.recordingId === recordingId) {

                    if (window.voiceUploadTimeout) {
                        clearTimeout(window.voiceUploadTimeout);
                        window.voiceUploadTimeout = null;
                    }

                    pendingVoiceFileId = data.fileId;

                    if (window.lastRecordedBlob) {
                        pendingVoiceUrl = URL.createObjectURL(window.lastRecordedBlob);
                        pendingVoiceAudioElement = new Audio(pendingVoiceUrl);
                        addFileIdToHiddenInput(data.fileId, '#uploadedFileIds');

                        isProcessing = false;
                        updateChatInputUI('preview', {
                            duration: data.duration,
                            durationFormatted: data.durationFormatted
                        });
                    } else {
                        console.error("Last recorded blob was not found for creating a preview.");
                        cleanupVoiceState();
                    }
                }
            });

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



                    // گام ۳ (جدید): از سرور میخواهیم تا تعداد پیام‌های خوانده نشده را برای ما بفرستد
                    console.log("Requesting unread counts from server...");
                    signalRConnection.invoke("RequestUnreadCounts")
                        .catch(err => console.error("Error requesting unread counts: ", err));


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

        triggerGetoldData: function (messageId, loadBothDirections) {
            getOldData(messageId, loadBothDirections);
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
                    // در صورت موفقیت از طریق رویداد حذف که از طریق سیگنار آر میاد، مدیریت میشه
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


});