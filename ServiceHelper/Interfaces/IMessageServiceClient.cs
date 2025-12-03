using Messenger.DTOs;
using Messenger.Models.Models;
using Messenger.WebApp.ServiceHelper.RequestDTOs;

namespace Messenger.WebApp.ServiceHelper.Interfaces
{
    public interface IMessageServiceClient
    {
        Task<MessageDto> SendPrivateMessageAsync(long receiverUserId, string messageText, List<long>? fileAttachementIds = null, long? replyToMessageId = null);
        Task<MessageDto> SendChannelMessageAsync(long channelId, string messageText, List<long>? fileAttachementIds = null, long? replyToMessageId = null);
        Task<MessageDto> SendClassGroupMessageAsync(int classId, string messageText, List<long>? fileAttachementIds = null, long? replyToMessageId = null);

        //Edit
        Task<MessageDto> EditMessageAsync(long messageId, int groupId, string groupType, string newText, List<long>? fileIds, List<long>? fileIdsToRemove);
        //Task<MessageDto> EditChannelMessageAsync(long messageId, string newText, List<long>? fileIds, List<long>? fileIdsToRemove);




        Task<MessageDto?> GetMessageByIdAsync(long messageId);
        Task<IEnumerable<MessageDto>> GetPrivateMessagesAsync(long userId1, long userId2, int pageNumber, int pageSize, long messageId, bool loadOlder);
        Task<IEnumerable<MessageDto>> GetChannelMessagesAsync(int channelId, int pageNumber, int pageSize, long messageId, bool loadOlder = false);
        Task<IEnumerable<MessageDto>> GetChatMessagesAsync(int chatId,
        string chatType, int pageNumber, int pageSize, long messageId, bool loadOlder = false, bool loadBothDirections = false);

        Task<IEnumerable<MessageDto>> GetChatPinnedMessagesAsync(int classId, string chatType, int pageSize);
        Task<long?> MarkMessageAsReadAsync(long messageId, long userId);
        Task<IEnumerable<MessageReadDto>> GetMessageReadStatusAsync(long messageId);
        Task PinMessageAsync(long messageId, bool isPinned);

        /// <summary>
        /// حذف بصورت واقعی نداریم و پیام مورد نظر را فقط مخفی میکنیم
        /// </summary>
        /// <param name="messageId"></param>
        /// <returns></returns>
        Task DeleteMessageAsync(DeleteMessageRequestDto deleteMessageRequestModel);

        Task<MessageFoulReportDto> ReportMessageAsync(long messageId, long reporterUserId, string reason);
        Task SaveMessageAsync(long messageId);
        Task<IEnumerable<MessageSavedDto>> GetSavedMessagesAsync();
        Task DeleteSavedMessageAsync(long messageSavedId);
        Task<MessageDto> SendPrivateFileMessageAsync(long senderUserId, long receiverUserId, string fileName, byte[] fileContent, string contentType, long fileSize);
        Task<MessageDto> SendChannelFileMessageAsync(long senderUserId, int channelId, string fileName, byte[] fileContent, string contentType, long fileSize);
        Task<MessageDto> SendClassGroupFileMessageAsync(long senderUserId, int classId, string fileName, byte[] fileContent, string contentType, long fileSize);

    }
}
