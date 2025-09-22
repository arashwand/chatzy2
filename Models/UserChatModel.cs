using Messenger.DTOs;

namespace Messenger.WebApp.Models
{
    public class UserChatModel
    {
        public IEnumerable<ClassGroupDto>? Groups { get; set; } 
        public IEnumerable<ChannelDto>? Channels { get; set; }
    }
}
