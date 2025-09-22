using Messenger.DTOs;
using Messenger.WebApp.RequestDTOs;
using Messenger.WebApp.ServiceHelper.Interfaces;

namespace Messenger.WebApp.ServiceHelper
{
    public class ChannelServiceClient : IChannelServiceClient
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<ChannelServiceClient> _logger;


        public ChannelServiceClient(IHttpClientFactory httpClientFactory, string serviceName, ILogger<ChannelServiceClient> logger)
        {
            _httpClient = httpClientFactory.CreateClient(serviceName);
            _logger = logger;
        }

        public async Task<ChannelDto> CreateChannelAsync(long creatorUserId, string channelName, string channelTitle)
        {
            var request = new CreateChannelRequest(creatorUserId, channelName, channelTitle);
            var response = await _httpClient.PostAsJsonAsync("api/channels", request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<ChannelDto>();
        }

        public async Task<ChannelDto?> GetChannelByIdAsync(int channelId)
        {
            return await _httpClient.GetFromJsonAsync<ChannelDto>($"api/channels/{channelId}");
        }

        public async Task<IEnumerable<ChannelDto>> GetAllChannelAsync()
        {
            var response = await _httpClient.GetFromJsonAsync<IEnumerable<ChannelDto>>($"api/channels/all/");
            return response ?? new List<ChannelDto>();
        }

        public async Task<IEnumerable<ChannelDto>> GetUserChannelsAsync(long userId)
        {
            try
            {
                var response = await _httpClient.GetFromJsonAsync<IEnumerable<ChannelDto>>($"api/channels/my");
                return response ?? new List<ChannelDto>();
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "An error occurred while fetching user channels for UserId: {UserId}", userId);
                return new List<ChannelDto>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred while fetching user channels for UserId: {UserId}", userId);
                return new List<ChannelDto>();
            }
        }

        public async Task UpdateChannelInfoAsync(int channelId, string newName, string newTitle)
        {
            var request = new UpdateChannelRequest(newName, newTitle);
            var response = await _httpClient.PutAsJsonAsync($"api/channels/{channelId}", request);
            response.EnsureSuccessStatusCode();
        }

        public async Task DeleteChannelAsync(int channelId)
        {
            var response = await _httpClient.DeleteAsync($"api/channels/{channelId}");
            response.EnsureSuccessStatusCode();
        }

        public async Task AddUserToChannelAsync(int channelId, long userIdToAdd, long addedByUserId)
        {
            var request = new { ChannelId = channelId, UserIdToAdd = userIdToAdd, AddedByUserId = addedByUserId };
            var response = await _httpClient.PostAsJsonAsync($"api/channels/{channelId}/members", request);
            response.EnsureSuccessStatusCode();
        }

        public async Task RemoveUserFromChannelAsync(int channelId, long userIdToRemove, long removedByUserId)
        {
            var request = new { UserIdToRemove = userIdToRemove, RemovedByUserId = removedByUserId };
            var response = await _httpClient.PostAsJsonAsync($"api/channels/{channelId}/members/remove", request);
            response.EnsureSuccessStatusCode();
        }

        public async Task<IEnumerable<UserDto>> GetChannelMembersAsync(int channelId)
        {
            var response = await _httpClient.GetFromJsonAsync<IEnumerable<UserDto>>($"api/channels/{channelId}/members");
            return response ?? new List<UserDto>();
        }

        public async Task<bool> IsUserMemberOfChannelAsync(long userId, int channelId)
        {
            try
            {

                var response = await _httpClient.GetFromJsonAsync<MemberDto>($"api/channels/{channelId}/members/{userId}/is-member");
                if (response.IsMember)
                    return true;
                return false;
            }
            catch (Exception ex)
            {
                return false;
            }
        }
    }
}
