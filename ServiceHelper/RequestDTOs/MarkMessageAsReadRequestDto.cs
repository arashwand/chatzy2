namespace Messenger.WebApp.ServiceHelper.RequestDTOs
{
    public class MarkMessageAsReadRequestDto
    {
        public int GroupId { get; set; }
        public string GroupType { get; set; }
        public long MessageId { get; set; }
    }
}
