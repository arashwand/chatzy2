using Messenger.DTOs;

namespace Messenger.WebApp.Models.ViewModels
{
    public class ChannelCreateViewModel
    {
        public string Name { get; set; }
        public string Title { get; set; }
    }

    public class ChannelEditViewModel
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string Title { get; set; }
    }

    public class ChannelDetailsViewModel
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string Title { get; set; }
        public long CreatorUserId { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class ChannelMembersViewModel
    {
        public int ChannelId { get; set; }
        public string ChannelName { get; set; }
        public IEnumerable<UserDto> Members { get; set; }
    }

    public class AddMemberToChannelViewModel
    {
        public int ChannelId { get; set; }
        public int UserIdToAdd { get; set; }
    }

    public class RemoveMemberFromChannelViewModel
    {
        public int ChannelId { get; set; }
        public string ChannelName { get; set; }
        public int UserIdToRemove { get; set; }
    }
}
