using Messenger.DTOs;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.Extensions.Logging;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json; // For ReadFromJsonAsync and PostAsJsonAsync
using System.Threading.Tasks;

namespace Messenger.WebApp.ServiceHelper
{
    public class RedisClient : IRedisClient
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<RedisClient> _logger;

        public RedisClient(IHttpClientFactory httpClientFactory, ILogger<RedisClient> logger)
        {
            _httpClient = httpClientFactory.CreateClient("RedisService"); 
            _logger = logger;
        }

        public async Task<List<long>> GetOnlineUsersAsync(string groupKey)
        {
            try
            {
                var response = await _httpClient.GetAsync($"api/RedisServices/onlineUsers/{groupKey}");
                if (response.IsSuccessStatusCode)
                {
                    if (response.Content.Headers.ContentLength == 0)
                    {
                        return new List<long>();
                    }
                    return await response.Content.ReadFromJsonAsync<List<long>>();
                }
                else
                {
                    _logger.LogError("Failed to get online users for group {GroupKey}. Status: {StatusCode}", groupKey, response.StatusCode);
                    return null; // Or throw an exception
                }
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "Exception while getting online users for group {GroupKey}", groupKey);
                throw; // Or return null
            }
        }

        public async Task<string[]> GetUserGroupKeysAsync(long userId)
        {
            try
            {
                var response = await _httpClient.GetAsync($"api/RedisServices/userGroupKeys/{userId}");
                if (response.IsSuccessStatusCode)
                {
                    if (response.Content.Headers.ContentLength == 0)
                    {
                        return System.Array.Empty<string>();
                    }
                    return await response.Content.ReadFromJsonAsync<string[]>();
                }
                else
                {
                    _logger.LogError("Failed to get user group keys for user {UserId}. Status: {StatusCode}", userId, response.StatusCode);
                    return null;
                }
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "Exception while getting user group keys for user {UserId}", userId);
                throw;
            }
        }

        public async Task<ChatMessageDto> GetLastMessageAsync(string groupType, string groupId)
        {
            try
            {
                var response = await _httpClient.GetAsync($"api/RedisServices/lastMessage/{groupType}/{groupId}");
                if (response.IsSuccessStatusCode)
                {
                    if (response.Content.Headers.ContentLength == 0)
                    {
                        return null;
                    }
                    return await response.Content.ReadFromJsonAsync<ChatMessageDto>();
                }
                else if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    return null;
                }
                else
                {
                    _logger.LogError("Failed to get last message for group {GroupType}/{GroupId}. Status: {StatusCode}", groupType, groupId, response.StatusCode);
                    return null;
                }
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "Exception while getting last message for group {GroupType}/{GroupId}", groupType, groupId);
                throw;
            }
        }
    }
}
