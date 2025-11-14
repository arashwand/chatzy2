using Messenger.DTOs;
using System.Collections.Generic;

namespace Messenger.WebApp.Models.ViewModels
{
    public class InitialChatDataViewModel
    {
        public SyncResultDto SyncResult { get; set; }
        public IEnumerable<MessageDto> Messages { get; set; }
        public int UnreadCount { get; set; }
        public long? LastReadMessageId { get; set; }
        public bool IsFromUnread { get; set; }
    }
}
