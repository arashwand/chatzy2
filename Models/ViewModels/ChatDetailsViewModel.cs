namespace Messenger.WebApp.Models.ViewModels
{
    public class ChatDetailsViewModel
    {
        public string GroupName { get; set; }
        public string GroupDescription { get; set; }
        public int MediaFilesCount { get; set; }
        public int DocumentFilesCount { get; set; }
        public int LinkFilesCount { get; set; }
        public IEnumerable<ChatMemberViewModel> Members { get; set; }
    }

    public class ChatMemberViewModel
    {
        public long UserId { get; set; }
        public string? FullName { get; set; }
        public string Status { get; set; }
        public string? ImagePath { get; set; }
        public string? RoleName { get; set; }
    }
}
