using Messenger.DTOs;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Messenger.WebApp.Services
{
    /// <summary>
    /// مدل درخواست برای همگام سازی تاریخچه چت
    /// </summary>
    public class SyncChatRequest
    {
        public string GroupType { get; set; }
        public string ChatId { get; set; }
        public System.DateTime SyncFrom { get; set; }
        public System.DateTime SyncTo { get; set; }
        public List<string> ClientMessageIds { get; set; }
    }

    /// <summary>
    /// مدل نتیجه برای همگام سازی تاریخچه چت
    /// </summary>
    public class SyncChatResult
    {
        public List<MessageDto> NewMessages { get; set; } = new List<MessageDto>();
        public List<MessageDto> EditedMessages { get; set; } = new List<MessageDto>();
        public List<long> DeletedMessageIds { get; set; } = new List<long>();
    }


    /// <summary>
    /// اینترفیس برای سرویس مدیریت پیام‌ها
    /// </summary>
    public interface IMessageService
    {
        /// <summary>
        /// تاریخچه چت را بر اساس آخرین فعالیت کاربر همگام‌سازی می‌کند
        /// </summary>
        Task<SyncChatResult> SyncChatHistoryAsync(SyncChatRequest request, long currentUserId);

        /// <summary>
        /// پیام‌های خصوصی بین دو کاربر را بازیابی می‌کند
        /// </summary>
        Task<IEnumerable<MessageDto>> GetPrivateMessagesAsync(long userId, long otherUserId, int pageNumber, int pageSize);

        /// <summary>
        /// پیام‌های یک کانال را بازیابی می‌کند
        /// </summary>
        Task<IEnumerable<MessageDto>> GetChannelMessagesAsync(int channelId, long userId, int pageNumber, int pageSize);

        /// <summary>
        /// پیام‌های یک گروه کلاسی را بازیابی می‌کند
        /// </summary>
        Task<IEnumerable<MessageDto>> GetClassGroupMessagesAsync(int classId, long userId, int pageNumber, int pageSize, long messageId);
    }
}
