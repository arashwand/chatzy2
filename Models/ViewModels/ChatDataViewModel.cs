using Messenger.DTOs; // برای استفاده از MessageDto
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System;

namespace Messenger.WebApp.Models.ViewModels
{
    /// <summary>
    /// مدل درخواست برای دریافت داده‌های اولیه چت.
    /// </summary>
    public class GetInitialChatDataRequest
    {
        [Required]
        public string GroupType { get; set; }

        [Required]
        public string ChatId { get; set; }

        /// <summary>
        /// آخرین شناسه‌ی پیامی که کلاینت دارد.
        /// برای همگام‌سازی‌های بعدی استفاده می‌شود.
        /// در اولین ورود به چت، این مقدار null خواهد بود.
        /// </summary>
        public long? LastMessageIdInClient { get; set; }

        /// <summary>
        /// آخرین زمان فعالیت کاربر که از localStorage خوانده می‌شود.
        /// برای همگام‌سازی پیام‌های ویرایش/حذف شده استفاده می‌شود.
        /// </summary>
        public DateTime? LastActivityTimestamp { get; set; }
    }

    /// <summary>
    /// مدل پاسخ برای داده‌های اولیه چت.
    /// </summary>
    public class GetInitialChatDataResult
    {
        /// <summary>
        /// لیست اصلی پیام‌ها برای نمایش.
        /// </summary>
        public List<MessageDto> Messages { get; set; } = new List<MessageDto>();

        /// <summary>
        /// لیست پیام‌های ویرایش شده (برای همگام‌سازی).
        /// </summary>
        public List<MessageDto> EditedMessages { get; set; } = new List<MessageDto>();

        /// <summary>
        /// لیست شناسه‌های پیام‌های حذف شده (برای همگام‌سازی).
        /// </summary>
        public List<long> DeletedMessageIds { get; set; } = new List<long>();

        /// <summary>
        /// شناسه‌ی آخرین پیامی که کاربر خوانده است.
        /// اگر null باشد، یعنی کاربر همه چیز را خوانده است.
        /// </summary>
        public long? LastReadMessageId { get; set; }

        /// <summary>
        /// تعداد کل پیام‌های خوانده نشده برای این چت.
        /// </summary>
        public int TotalUnreadCount { get; set; }

        /// <summary>
        /// آیا هنوز پیام‌های قدیمی‌تری برای بارگذاری وجود دارد؟
        /// برای کنترل اسکرول بی‌نهایت (infinite scroll).
        /// </summary>
        public bool HasMoreOldMessages { get; set; }
    }
}
