(function () {
    // --- Mobile Keyboard Layout Handlers ---

    // 1. تشخیص پلتفرم
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // اگر نه اندروید است و نه iOS، هیچ کاری نکن
    if (!isAndroid && !isIOS) {
        console.log('Non-mobile platform. Skipping mobile layout handlers.');
        return;
    }

    // 2. منطق مخصوص iOS
    if (isIOS) {
        console.log("iOS device detected. Applying iOS-specific keyboard handling.");

        // این تابع باید بعد از بارگذاری محتوای چت فراخوانی شود
        window.initializeIosKeyboardHandlers = function() {
            const messagesPanel = document.querySelector('.messages-panel');
            const inputEl = document.getElementById('message-input');
            const chatContentEl = document.getElementById('chat_content');

            if (!messagesPanel || !inputEl || !chatContentEl) {
                console.log('iOS handler: Required elements not found. Aborting.');
                return;
            }

            const vv = window.visualViewport;

            // افزایش z-index برای اطمینان از نمایش روی سایر عناصر
            messagesPanel.style.zIndex = '1050';

            const onViewportChange = () => {
                const offsetBottom = window.innerHeight - vv.height;
                if (offsetBottom > 0) {
                    messagesPanel.style.transform = `translateY(${-offsetBottom}px)`;
                } else {
                    messagesPanel.style.transform = 'translateY(0)';
                }
                // اسکرول محتوای چت به پایین
                chatContentEl.scrollTop = chatContentEl.scrollHeight;
            };

            const onFocus = () => {
                vv.addEventListener('resize', onViewportChange);
                vv.addEventListener('scroll', onViewportChange);
                setTimeout(onViewportChange, 100); // اجرای اولیه
            };

            const onBlur = () => {
                messagesPanel.style.transform = 'translateY(0)';
                vv.removeEventListener('resize', onViewportChange);
                vv.removeEventListener('scroll', onViewportChange);
            };

            // حذف لیسنرهای قبلی برای جلوگیری از ثبت چندباره
            inputEl.removeEventListener('focus', onFocus);
            inputEl.removeEventListener('blur', onBlur);

            // ثبت لیسنرهای جدید
            inputEl.addEventListener('focus', onFocus);
            inputEl.addEventListener('blur', onBlur);

            console.log('iOS keyboard handlers initialized for chat view.');
        };
    }

    // 3. منطق مخصوص Android
    //if (isAndroid) {
    //    console.log("Android device detected. Applying Android-specific layout handling.");

    //    $(document).on("focus", "#message-input", function () {
    //        console.log('--------------------input focus----------------------------');
    //        let el = document.getElementById("message-input");

    //        setTimeout(() => {
    //            el.scrollIntoView({ block: "center", behavior: "smooth" });
    //            window.scrollTo(0, document.body.scrollHeight);
    //        }, 200);
    //    });

    //    function adjustChatLayout() {
    //        const chatPanel = $('#chat-details-panel');
    //        if (!chatPanel.length || !chatPanel.hasClass('visible')) {
    //            return;
    //        }

    //        const initialHeight = window.innerHeight;
    //        chatPanel.css('height', `${initialHeight}px`);
    //        console.log(`Chat panel height set to: ${initialHeight}px`);

    //        // Adjust on keyboard show/hide
    //        $(window).off('resize.chatLayout').on('resize.chatLayout', function () {
    //            const newHeight = window.innerHeight;
    //            chatPanel.css('height', `${newHeight}px`);
    //            console.log(`Chat panel resized to: ${newHeight}px`);
    //            // Scroll to the bottom of the messages
    //            const chatContent = $('#chat_content');
    //            if (chatContent.length) {
    //                chatContent.scrollTop(chatContent.prop("scrollHeight"));
    //            }
    //        });
    //    }

    //    function cleanupChatLayout() {
    //        $(window).off('resize.chatLayout');
    //        console.log('Chat layout resize listener removed.');
    //    }

    //    const observer = new MutationObserver(function (mutations) {
    //        mutations.forEach(function (mutation) {
    //            if (mutation.addedNodes.length) {
    //                const chatPanel = $(mutation.addedNodes).find('#chat-details-panel').addBack('#chat-details-panel');
    //                if (chatPanel.length && chatPanel.hasClass('visible')) {
    //                    console.log('Chat panel is now visible. Attaching layout adjuster.');
    //                    adjustChatLayout();
    //                }
    //            }
    //            if (mutation.type === 'attributes' && $(mutation.target).is('#chat-details-panel')) {
    //                const chatPanel = $(mutation.target);
    //                if (chatPanel.hasClass('visible')) {
    //                    console.log('Chat panel became visible. Attaching layout adjuster.');
    //                    adjustChatLayout();
    //                } else {
    //                    console.log('Chat panel is hidden. Cleaning up.');
    //                    cleanupChatLayout();
    //                }
    //            }
    //        });
    //    });

    //    const config = { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] };
    //    observer.observe(document.body, config);
    //}
})();
