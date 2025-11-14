using Messenger.DTOs;

namespace Messenger.WebApp.Models.ViewModels
{
    public class InitialChatDataRequest
    {
        public int ChatId { get; set; }
        public string GroupType { get; set; }
        public SyncRequestDto SyncRequest { get; set; }
    }
}
