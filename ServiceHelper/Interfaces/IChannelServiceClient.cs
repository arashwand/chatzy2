using Messenger.DTOs;

namespace Messenger.WebApp.ServiceHelper.Interfaces
{
    public interface IChannelServiceClient
    {
        Task<ChannelDto> CreateChannelAsync(long creatorUserId, string channelName, string channelTitle);
        Task<ChannelDto?> GetChannelByIdAsync(int channelId);
        Task<IEnumerable<ChannelDto>> GetAllChannelAsync();
        Task<IEnumerable<ChannelDto>> GetUserChannelsAsync(long userId);
        Task UpdateChannelInfoAsync(int channelId, string newName, string newTitle);
        Task DeleteChannelAsync(int channelId);
        Task AddUserToChannelAsync(int channelId, long userIdToAdd, long addedByUserId);
        Task RemoveUserFromChannelAsync(int channelId, long userIdToRemove, long removedByUserId);
        Task<IEnumerable<UserDto>> GetChannelMembersAsync(int channelId);
        Task<bool> IsUserMemberOfChannelAsync(long userId, int channelId);
    }
}
