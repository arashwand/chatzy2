using Messenger.DTOs;
using Messenger.Tools;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.AspNetCore.Authorization;
using System.Text.Json;

namespace Messenger.WebApp.ServiceHelper
{

    [Authorize] // این ویژگی به فضای نام Microsoft.AspNetCore.Authorization نیاز دارد
    public class ClassGroupServiceClient : IClassGroupServiceClient
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<ClassGroupServiceClient> _logger;

        public ClassGroupServiceClient(IHttpClientFactory httpClientFactory, string serviceName, ILogger<ClassGroupServiceClient> logger)
        {
            _httpClient = httpClientFactory.CreateClient(serviceName ?? throw new ArgumentNullException(nameof(serviceName)));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public async Task<ClassGroupDto?> CreateClassGroupAsync(ClassGroupDto model)
        {
            if (model == null)
            {
                _logger.LogError("CreateClassGroupAsync: model cannot be null.");
                throw new ArgumentNullException(nameof(model));
            }

            try
            {
                _logger.LogInformation("Attempting to create class group. Model: {@Model}", model);
                var response = await _httpClient.PostAsJsonAsync("api/classgroups", model);
                response.EnsureSuccessStatusCode(); // در صورت عدم موفقیت، HttpRequestException ایجاد می کند
                var createdClassGroup = await response.Content.ReadFromJsonAsync<ClassGroupDto>();
                _logger.LogInformation("Successfully created class group. Response: {@CreatedClassGroup}", createdClassGroup);
                return createdClassGroup;
            }
            catch (HttpRequestException ex)
            {
                // این خطا زمانی رخ می دهد که پاسخ API یک کد وضعیت ناموفق باشد
                _logger.LogError(ex, "HTTP error creating class group. Status Code: {StatusCode}, Reason: {ReasonPhrase}, Request: {@Model}", ex.StatusCode, ex.Message, model);
                // بسته به نیاز، می توانید یک استثنای سفارشی ایجاد کنید یا null برگردانید
                return null;
            }
            catch (JsonException ex)
            {
                // این خطا زمانی رخ می دهد که مشکلی در (دی)سریالایز کردن JSON وجود داشته باشد
                _logger.LogError(ex, "JSON error creating class group. Request: {@Model}", model);
                return null;
            }
            catch (Exception ex)
            {
                // گرفتن هرگونه استثنای پیش بینی نشده دیگر
                _logger.LogError(ex, "An unexpected error occurred while creating class group. Request: {@Model}", model);
                return null;
            }
        }

        public async Task<ClassGroupDto?> GetClassGroupByIdAsync(int classId)
        {
            try
            {
                _logger.LogInformation("Attempting to get class group by ID: {ClassId}", classId);
                var classGroup = await _httpClient.GetFromJsonAsync<ClassGroupDto>($"api/classgroups/{classId}");
                if (classGroup == null)
                {
                    _logger.LogWarning("Class group with ID {ClassId} not found or API returned null.", classId);
                }
                else
                {
                    _logger.LogInformation("Successfully retrieved class group with ID {ClassId}.", classId);
                }
                return classGroup;
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error retrieving class group by ID {ClassId}. Status Code: {StatusCode}, Reason: {ReasonPhrase}", classId, ex.StatusCode, ex.Message);
                return null;
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "JSON error retrieving class group by ID {ClassId}.", classId);
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred while retrieving class group by ID {ClassId}.", classId);
                return null;
            }
        }


        /// <summary>
        /// گروههایی که یک کاربر(دانشجو یا استاد) در ان قرار دارد، وقتی این متد را فراخوانی میکنیم، در سمت وب سرویس بصورت اتومات ایدی کاربر را میگیرد
        /// </summary>
        /// <param name="userId"></param>
        /// <returns></returns>
        public async Task<IEnumerable<ClassGroupDto>> GetUserClassGroupsAsync(long userId)
        {
            try
            {
                _logger.LogInformation("Attempting to get user class groups for UserID: {UserId}", userId);
                var response = await _httpClient.GetFromJsonAsync<IEnumerable<ClassGroupDto>>($"api/classgroups/my"); // userId به عنوان پارامتر کوئری یا در هدر ارسال می شود؟
                _logger.LogInformation("Successfully retrieved user class groups for UserID: {UserId}", userId);
                return response ?? new List<ClassGroupDto>();
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error retrieving user's (UserID: {UserId}) class groups. Status Code: {StatusCode}, Reason: {ReasonPhrase}", userId, ex.StatusCode, ex.Message);
                return new List<ClassGroupDto>();
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "JSON error retrieving user's (UserID: {UserId}) class groups.", userId);
                return new List<ClassGroupDto>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred while retrieving user's (UserID: {UserId}) class groups.", userId);
                return new List<ClassGroupDto>();
            }
        }


        /// <summary>
        /// گروههایی که یک کاربر(دانشجو یا استاد) در ان قرار دارد، برای نمایش مدیر کاربرد دارد
        /// </summary>
        /// <param name="userId"></param>
        /// <returns></returns>
        [Authorize(Roles = ConstRoles.Manager)]
        public async Task<IEnumerable<ClassGroupDto>> ShowUserClassGroupsAsync(long userId)
        {
            try
            {
                _logger.LogInformation("Attempting to get user class groups for UserID: {UserId}", userId);
                var response = await _httpClient.GetFromJsonAsync<IEnumerable<ClassGroupDto>>($"api/classgroups/userClassGroups/{userId}"); // userId به عنوان پارامتر کوئری یا در هدر ارسال می شود؟
                _logger.LogInformation("Successfully retrieved user class groups for UserID: {UserId}", userId);
                return response ?? new List<ClassGroupDto>();
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error retrieving user's (UserID: {UserId}) class groups. Status Code: {StatusCode}, Reason: {ReasonPhrase}", userId, ex.StatusCode, ex.Message);
                return new List<ClassGroupDto>();
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "JSON error retrieving user's (UserID: {UserId}) class groups.", userId);
                return new List<ClassGroupDto>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred while retrieving user's (UserID: {UserId}) class groups.", userId);
                return new List<ClassGroupDto>();
            }
        }

        public async Task<IEnumerable<ClassGroupDto>> GetAllClassGroupsAsync()
        {
            try
            {
                _logger.LogInformation("Attempting to get all class groups.");
                var response = await _httpClient.GetFromJsonAsync<IEnumerable<ClassGroupDto>>("api/classgroups/all");
                _logger.LogInformation("Successfully retrieved all class groups.");
                return response ?? new List<ClassGroupDto>();
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error retrieving all class groups. Status Code: {StatusCode}, Reason: {ReasonPhrase}", ex.StatusCode, ex.Message);
                return new List<ClassGroupDto>();
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "JSON error retrieving all class groups.");
                return new List<ClassGroupDto>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred while retrieving all class groups.");
                return new List<ClassGroupDto>();
            }
        }

        /// <summary>
        /// ایدی استاد صرفا جهت لاگ گیری استفاده میشود و در وبسرویس از طریق توکن استخراج میشود
        /// </summary>
        /// <param name="teacherUserId"></param>
        /// <returns></returns>
        public async Task<IEnumerable<ClassGroupDto>> GetTaughtClassGroupsAsync(long teacherUserId)
        {
            try
            {
                _logger.LogInformation("Attempting to get taught class groups for TeacherUserID: {TeacherUserId}", teacherUserId);
                // فرض بر این است که API از طریق کوکی/توکن احراز هویت، معلم را شناسایی می کند
                var response = await _httpClient.GetFromJsonAsync<IEnumerable<ClassGroupDto>>("api/classgroups/taught");
                _logger.LogInformation("Successfully retrieved taught class groups for TeacherUserID: {TeacherUserId}", teacherUserId);
                return response ?? new List<ClassGroupDto>();
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error retrieving taught class groups for TeacherUserID: {TeacherUserId}. Status Code: {StatusCode}, Reason: {ReasonPhrase}", teacherUserId, ex.StatusCode, ex.Message);
                return new List<ClassGroupDto>();
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "JSON error retrieving taught class groups for TeacherUserID: {TeacherUserId}.", teacherUserId);
                return new List<ClassGroupDto>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred while retrieving taught class groups for TeacherUserID: {TeacherUserId}.", teacherUserId);
                return new List<ClassGroupDto>();
            }
        }


        /// <summary>
        /// وقتی میخواهیم ببینیم یک دبیر در چه کلاسهایی تدریس میکند
        /// مستقیم از متد اختصاصی این کوئری استفاده کردیم با  احراز هویست نقش دبیر یا استاد
        /// </summary>
        /// <param name="teacherUserId"></param>
        /// <returns></returns>
        [Authorize(Roles = ConstRoles.Manager)]
        public async Task<IEnumerable<ClassGroupDto>> GetTeacherTaughtClassGroupsAsync(long teacherUserId)
        {
            try
            {
                _logger.LogInformation("Attempting to get specific teacher's taught class groups for TeacherUserID: {TeacherUserId}", teacherUserId);
                var response = await _httpClient.GetFromJsonAsync<IEnumerable<ClassGroupDto>>($"api/classgroups/taught/{teacherUserId}");
                _logger.LogInformation("Successfully retrieved specific teacher's taught class groups for TeacherUserID: {TeacherUserId}", teacherUserId);
                return response ?? new List<ClassGroupDto>();
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error retrieving specific teacher's (TeacherUserID: {TeacherUserId}) taught class groups. Status Code: {StatusCode}, Reason: {ReasonPhrase}", teacherUserId, ex.StatusCode, ex.Message);
                return new List<ClassGroupDto>();
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "JSON error retrieving specific teacher's (TeacherUserID: {TeacherUserId}) taught class groups.", teacherUserId);
                return new List<ClassGroupDto>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred while retrieving specific teacher's (TeacherUserID: {TeacherUserId}) taught class groups.", teacherUserId);
                return new List<ClassGroupDto>();
            }
        }

        public async Task UpdateClassGroupInfoAsync(ClassGroupDto model)
        {
            if (model == null)
            {
                _logger.LogError("UpdateClassGroupInfoAsync: model cannot be null.");
                throw new ArgumentNullException(nameof(model));
            }

            try
            {
                _logger.LogInformation("Attempting to update class group info. ClassID: {ClassId}, Model: {@Model}", model.ClassId, model);
                var response = await _httpClient.PutAsJsonAsync($"api/classgroups/{model.ClassId}", model);
                response.EnsureSuccessStatusCode();
                _logger.LogInformation("Successfully updated class group info for ClassID: {ClassId}", model.ClassId);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error updating class group info (ClassID: {ClassId}). Status Code: {StatusCode}, Reason: {ReasonPhrase}, Request: {@Model}", model.ClassId, ex.StatusCode, ex.Message, model);
                throw; // پرتاب مجدد برای اینکه فراخواننده بتواند خطا را مدیریت کند
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "JSON error updating class group info (ClassID: {ClassId}). Request: {@Model}", model.ClassId, model);
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred while updating class group info (ClassID: {ClassId}). Request: {@Model}", model.ClassId, model);
                throw;
            }
        }

        public async Task DeleteClassGroupAsync(int classId)
        {
            try
            {
                _logger.LogInformation("Attempting to delete class group with ID: {ClassId}", classId);
                var response = await _httpClient.DeleteAsync($"api/classgroups/{classId}");
                response.EnsureSuccessStatusCode();
                _logger.LogInformation("Successfully deleted class group with ID: {ClassId}", classId);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error deleting class group (ClassID: {ClassId}). Status Code: {StatusCode}, Reason: {ReasonPhrase}", classId, ex.StatusCode, ex.Message);
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred while deleting class group (ClassID: {ClassId}).", classId);
                throw;
            }
        }

        public async Task<IEnumerable<UserDto>> GetClassGroupMembersAsync(int classId)
        {
            try
            {
                _logger.LogInformation("Attempting to get class group members for ClassID: {ClassId}", classId);
                var response = await _httpClient.GetFromJsonAsync<IEnumerable<UserDto>>($"api/classgroups/{classId}/members");
                _logger.LogInformation("Successfully retrieved class group members for ClassID: {ClassId}", classId);
                return response ?? new List<UserDto>();
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error retrieving class group members for ClassID {ClassId}. Status Code: {StatusCode}, Reason: {ReasonPhrase}", classId, ex.StatusCode, ex.Message);
                return new List<UserDto>();
            }
            catch (JsonException ex)
            {
                _logger.LogError(ex, "JSON error retrieving class group members for ClassID {ClassId}.", classId);
                return new List<UserDto>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred while retrieving class group members for ClassID {ClassId}.", classId);
                return new List<UserDto>();
            }
        }

        public async Task AddUserToClassGroupAsync(int classId, long userIdToAdd, long addedByUserId)
        {
            try
            {
                _logger.LogInformation("Attempting to add user (UserIDToAdd: {UserIdToAdd}) to class group (ClassID: {ClassId}) by user (AddedByUserID: {AddedByUserId})", userIdToAdd, classId, addedByUserId);
                // بدنه درخواست در اینجا null است، اگر API انتظار بدنه ای داشته باشد، باید آن را تهیه کنید
                var response = await _httpClient.PostAsync($"api/classgroups/{classId}/members/{userIdToAdd}", null);
                response.EnsureSuccessStatusCode();
                _logger.LogInformation("Successfully added user (UserIDToAdd: {UserIdToAdd}) to class group (ClassID: {ClassId})", userIdToAdd, classId);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error adding user (UserIDToAdd: {UserIdToAdd}) to class group (ClassID: {ClassId}) by user (AddedByUserID: {AddedByUserId}). Status Code: {StatusCode}, Reason: {ReasonPhrase}", userIdToAdd, classId, addedByUserId, ex.StatusCode, ex.Message);
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred while adding user (UserIDToAdd: {UserIdToAdd}) to class group (ClassID: {ClassId}) by user (AddedByUserID: {AddedByUserId}).", userIdToAdd, classId, addedByUserId);
                throw;
            }
        }

        public async Task RemoveUserFromClassGroupAsync(int classId, long userIdToRemove, long removedByUserId)
        {
            try
            {
                _logger.LogInformation("Attempting to remove user (UserIDToRemove: {UserIdToRemove}) from class group (ClassID: {ClassId}) by user (RemovedByUserID: {RemovedByUserId})", userIdToRemove, classId, removedByUserId);
                var response = await _httpClient.DeleteAsync($"api/classgroups/{classId}/members/{userIdToRemove}");
                response.EnsureSuccessStatusCode();
                _logger.LogInformation("Successfully removed user (UserIDToRemove: {UserIdToRemove}) from class group (ClassID: {ClassId})", userIdToRemove, classId);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "HTTP error removing user (UserIDToRemove: {UserIdToRemove}) from class group (ClassID: {ClassId}) by user (RemovedByUserID: {RemovedByUserId}). Status Code: {StatusCode}, Reason: {ReasonPhrase}", userIdToRemove, classId, removedByUserId, ex.StatusCode, ex.Message);
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred while removing user (UserIDToRemove: {UserIdToRemove}) from class group (ClassID: {ClassId}) by user (RemovedByUserId: {RemovedByUserId}).", userIdToRemove, classId, removedByUserId);
                throw;
            }
        }

        public async Task<bool> IsUserMemberOfClassGroupAsync(long userId, int classId)
        {
            try
            {
                var response = await _httpClient.GetFromJsonAsync<MemberDto>($"api/classgroups/{classId}/members/{userId}/is-member");

                if (response.IsMember)
                {                    
                    return response.IsMember;
                }
                else
                {                    
                    return false;
                }
            }
            catch (Exception)
            {
                return false;
            }            
        }
    }
}
