using Messenger.DTOs;

namespace Messenger.WebApp.Models.ViewModels
{
    public class ChatViewModel
    {
        public long ClassGroupId { get; set; }       
        public string ClassGroupName { get; set; }
        
        /// <summary>
        /// تعین کننده اینکه گروه یا کانال است
        /// </summary>
        public string GroupType { get; set; }
        public int MemberCount { get; set; }

        public IEnumerable<UserDto> Members { get; set; }

    }

    public class MemberViewModel
    {
        public long UserId { get; set; }
        public string FullName { get; set; }
        public string RoleFaName { get; set; }
        public string RoleName { get; set; }
        public string ProfilePictureUrl { get; set; }
    }

    public class MessageViewModel
    {
        public long MessageId { get; set; }
        public string MessageContent { get; set; }
        public DateTime MessageDate { get; set; }
        public int MyProperty { get; set; }
        public bool edited { get; set; }
        public MemberViewModel Member { get; set; }

    }

    public class MessageFileViewModel
    {
        public long MessageId { get; set; }
        public string FileName { get; set; }
        public string FilePath { get; set; }
        public string FileType { get; set; }
        public long FileSize { get; set; }

    }
}
