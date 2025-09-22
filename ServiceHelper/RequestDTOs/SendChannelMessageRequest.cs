namespace Messenger.WebApp.RequestDTOs
{
    public record SendChannelMessageRequest(int ChannelId, string MessageText);
}
