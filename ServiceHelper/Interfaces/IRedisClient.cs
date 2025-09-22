using Messenger.DTOs; // Assuming ChatMessageDto and other relevant DTOs are here
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Messenger.WebApp.ServiceHelper.Interfaces
{
    // Define DTOs that might be returned by the API endpoints
    // These might already exist in your DTOs project or need to be created/adjusted.
    // For example:
    // public class UserStatusDto { public long UserId { get; set; } public bool IsOnline { get; set; } ... }
    // public class OnlineUserDto { public long UserId { get; set; } ... }
    // We'll use List<long> for onlineUserIds and string[] for groupKeys as per RedisServicesController for now.

    public interface IRedisClient
    {
        Task<List<long>> GetOnlineUsersAsync(string groupKey);
        Task<string[]> GetUserGroupKeysAsync(long userId);
        Task<ChatMessageDto> GetLastMessageAsync(string groupType, string groupId);
        // Add other methods as needed by HomeController or other parts of WebApp
    }
}
