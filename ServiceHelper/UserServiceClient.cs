using Messenger.DTOs;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.Extensions.Logging;

namespace Messenger.WebApp.ServiceHelper
{
    public class UserServiceClient : IUserServiceClient
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<UserServiceClient> _logger;
        public UserServiceClient(IHttpClientFactory httpClientFactory,string serviceName, ILogger<UserServiceClient> logger)
        {
            _httpClient = httpClientFactory.CreateClient(serviceName);
            _logger = logger;
        }

        public async Task<UserDto?> GetUserByIdAsync(long userId)
        {
            if (userId <= 0)
            {
                _logger.LogError("شناسه کاربر باید بزرگتر از صفر باشد. شناسه وارد شده: {UserId}", userId);
                throw new ArgumentException("شناسه کاربر باید بزرگتر از صفر باشد.", nameof(userId));
            }

            var response = await _httpClient.GetAsync($"api/users/{userId}");

            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                _logger.LogWarning("کاربر با شناسه {UserId} یافت نشد.", userId);
                return null;
            }

            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<UserDto>() ?? throw new InvalidOperationException("Failed to retrieve user.");
        }

        public async Task<IEnumerable<UserDto>> SearchUsersAsync(string query)
        {
            if (string.IsNullOrWhiteSpace(query))
                throw new ArgumentException("Search query cannot be empty.", nameof(query));

            var response = await _httpClient.GetAsync($"api/users/search?query={Uri.EscapeDataString(query)}");
            response.EnsureSuccessStatusCode();
            var users = await response.Content.ReadFromJsonAsync<IEnumerable<UserDto>>();
            return users ?? new List<UserDto>();
        }

        public async Task<IEnumerable<BlockedUserDto>> GetBlockedUsersAsync(long userId)
        {
            if (userId <= 0)
                throw new ArgumentException("User ID must be greater than zero.", nameof(userId));

            var response = await _httpClient.GetAsync("api/users/blocked");
            response.EnsureSuccessStatusCode();
            var blockedUsers = await response.Content.ReadFromJsonAsync<IEnumerable<BlockedUserDto>>();
            return blockedUsers ?? new List<BlockedUserDto>();
        }

        public async Task BlockUserAsync(long blockerUserId, long userIdToBlock, string? comment)
        {
            if (blockerUserId <= 0)
                throw new ArgumentException("Blocker user ID must be greater than zero.", nameof(blockerUserId));
            if (userIdToBlock <= 0)
                throw new ArgumentException("User ID to block must be greater than zero.", nameof(userIdToBlock));

            var request = new { Comment = comment };
            var response = await _httpClient.PostAsJsonAsync($"api/users/block/{userIdToBlock}", request);
            response.EnsureSuccessStatusCode();
        }

        public async Task UnblockUserAsync(long blockerUserId, long userIdToUnblock)
        {
            if (blockerUserId <= 0)
                throw new ArgumentException("Blocker user ID must be greater than zero.", nameof(blockerUserId));
            if (userIdToUnblock <= 0)
                throw new ArgumentException("User ID to unblock must be greater than zero.", nameof(userIdToUnblock));

            var response = await _httpClient.DeleteAsync($"api/users/unblock/{userIdToUnblock}");
            response.EnsureSuccessStatusCode();
        }


    }
}
