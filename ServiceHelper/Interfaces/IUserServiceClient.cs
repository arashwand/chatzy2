using Messenger.DTOs;

namespace Messenger.WebApp.ServiceHelper.Interfaces
{
    public interface IUserServiceClient
    {
        Task<UserDto> GetUserByIdAsync(long userId);
        Task<IEnumerable<UserDto>> SearchUsersAsync(string query);
        Task<IEnumerable<BlockedUserDto>> GetBlockedUsersAsync(long userId);
        Task BlockUserAsync(long blockerUserId, long userIdToBlock, string? comment);
        Task UnblockUserAsync(long blockerUserId, long userIdToUnblock);
    }
}
