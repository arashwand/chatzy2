using Messenger.DTOs;

namespace Messenger.WebApp.ServiceHelper.Interfaces
{
    public interface IClassGroupServiceClient
    {
        Task<ClassGroupDto> CreateClassGroupAsync(ClassGroupDto model);
        Task<ClassGroupDto?> GetClassGroupByIdAsync(int classId);
        Task<IEnumerable<ClassGroupDto>> GetUserClassGroupsAsync(long userId);
        Task<IEnumerable<ClassGroupDto>> ShowUserClassGroupsAsync(long userId);
        Task<IEnumerable<ClassGroupDto>> GetAllClassGroupsAsync();
        Task<IEnumerable<ClassGroupDto>> GetTaughtClassGroupsAsync(long teacherUserId);
        Task<IEnumerable<ClassGroupDto>> GetTeacherTaughtClassGroupsAsync(long teacherUserId);
        Task UpdateClassGroupInfoAsync(ClassGroupDto model);
        Task DeleteClassGroupAsync(int classId);
        Task<IEnumerable<UserDto>> GetClassGroupMembersAsync(int classId);
        Task AddUserToClassGroupAsync(int classId, long userIdToAdd, long addedByUserId);
        Task RemoveUserFromClassGroupAsync(int classId, long userIdToRemove, long removedByUserId);
        Task<bool> IsUserMemberOfClassGroupAsync(long userId, int channelId);
    }
}
