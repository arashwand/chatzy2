using Messenger.DTOs;

namespace Messenger.WebApp.Models.ViewModels
{
    public class ClassGroupMembersViewModel
    {
        public int ClassId { get; set; }
        public string LevelName { get; set; }
        public IEnumerable<UserDto> Members { get; set; }
    }

    public class AddMemberToGoupViewModel
    {
        public int ClassId { get; set; }
        public int UserIdToAdd { get; set; }
    }

    public class RemoveMemberFromGroupViewModel
    {
        public int ClassId { get; set; }
        public string LevelName { get; set; }
        public int UserIdToRemove { get; set; }
    }
}
