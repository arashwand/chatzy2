using Messenger.DTOs;
using Messenger.WebApp.Models.ViewModels;
using Messenger.WebApp.ServiceHelper.Interfaces;

namespace Messenger.WebApp.ServiceHelper
{
    public class ManageUserServiceClient : IManageUserServiceClient
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<ManageUserServiceClient> _logger;

        public ManageUserServiceClient(IHttpClientFactory httpClientFactory,string serviceName, ILogger<ManageUserServiceClient> logger)
        {
            _httpClient = httpClientFactory.CreateClient(serviceName);
            _logger = logger;
        }

        public async Task<IEnumerable<UserDto>> GetAllUsersAsync()
        {
            _logger.LogInformation("Fetching all users from API.");

            try
            {
                var response = await _httpClient.GetAsync("api/manageusers");
                if (!response.IsSuccessStatusCode)
                {
                    switch (response.StatusCode)
                    {
                        case System.Net.HttpStatusCode.Unauthorized:
                            _logger.LogWarning("Unauthorized access when fetching users.");
                            throw new UnauthorizedAccessException("احراز هویت ناموفق. لطفاً دوباره وارد شوید.");
                        case System.Net.HttpStatusCode.Forbidden:
                            _logger.LogWarning("Forbidden access when fetching users. Admin policy required.");
                            throw new UnauthorizedAccessException("شما مجوز لازم برای دسترسی به این منبع را ندارید.");
                        default:
                            _logger.LogError("Failed to fetch users. Status code: {StatusCode}, Reason: {ReasonPhrase}", response.StatusCode, response.ReasonPhrase);
                            throw new HttpRequestException($"خطا در دریافت کاربران: {response.ReasonPhrase}");
                    }
                }

                var users = await response.Content.ReadFromJsonAsync<IEnumerable<UserDto>>();
                if (users == null)
                {
                    _logger.LogWarning("API returned null response for users.");
                    throw new InvalidOperationException("پاسخ API برای کاربران نامعتبر است.");
                }

                _logger.LogInformation("Successfully fetched {UserCount} users.", users.Count());
                return users;
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Network error occurred while fetching users.");
                throw new InvalidOperationException("خطا در اتصال به سرور. لطفاً اتصال شبکه خود را بررسی کنید.", ex);
            }
            catch (System.Text.Json.JsonException ex)
            {
                _logger.LogError(ex, "JSON deserialization error while fetching users.");
                throw new InvalidOperationException("خطا در پردازش پاسخ API.", ex);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error while fetching users.");
                throw;
            }
        }


        public async Task<UserDto> GetUserByIdAsync(long id)
        {
            if (id <= 0)
                throw new ArgumentException("User ID must be greater than zero.", nameof(id));

            var response = await _httpClient.GetAsync($"api/manageusers/{id}");
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                throw new KeyNotFoundException("کاربر یافت نشد.");

            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<UserDto>() ?? throw new InvalidOperationException("Failed to retrieve user.");
        }

        public async Task CreateUserAsync(UserDto userDto)
        {
            if (userDto == null)
                throw new ArgumentNullException(nameof(userDto));

            var response = await _httpClient.PostAsJsonAsync("api/manageusers", userDto);
            if (response.StatusCode == System.Net.HttpStatusCode.BadRequest)
            {
                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                throw new InvalidOperationException(error?.Message ?? "Failed to create user.");
            }

            response.EnsureSuccessStatusCode();
        }

        public async Task UpdateUserAsync(UserDto userDto)
        {
            if (userDto == null)
                throw new ArgumentNullException(nameof(userDto));

            var response = await _httpClient.PutAsJsonAsync("api/manageusers", userDto);
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                throw new KeyNotFoundException(error?.Message ?? "کاربر یافت نشد.");
            }

            response.EnsureSuccessStatusCode();
        }

        public async Task DeleteUserAsync(long id)
        {
            if (id <= 0)
                throw new ArgumentException("User ID must be greater than zero.", nameof(id));

            var response = await _httpClient.DeleteAsync($"api/manageusers/{id}");
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                var error = await response.Content.ReadFromJsonAsync<ErrorResponse>();
                throw new KeyNotFoundException(error?.Message ?? "کاربر یافت نشد.");
            }

            response.EnsureSuccessStatusCode();
        }

    }
}
