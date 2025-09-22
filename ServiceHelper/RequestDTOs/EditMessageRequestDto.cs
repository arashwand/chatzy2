namespace Messenger.WebApp.ServiceHelper.RequestDTOs
{
    public class EditMessageRequestDto
    {
        public long MessageId { get; set; }
        public string NewText { get; set; }
        public int GroupId { get; set; }
        public string GroupType { get; set; }
        public List<long>? FileIds { get; set; }
        public List<long>? FileIdsToRemove { get; set; }
    }
}
