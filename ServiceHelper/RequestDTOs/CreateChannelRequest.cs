namespace Messenger.WebApp.RequestDTOs
{
    public record CreateChannelRequest(long CreatorUserId, string ChannelName, string ChannelTitle);
}
