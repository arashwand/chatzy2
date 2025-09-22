namespace Messenger.WebApp.RequestDTOs
{
    public record SendPrivateMessageRequest(int ReceiverUserId, string MessageText);

}
