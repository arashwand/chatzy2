using Messenger.WebApp.ServiceHelper.RequestDTOs;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Messenger.WebApp.ServiceHelper.Interfaces
{
    public interface IChatService
    {
        // ----- متدهای مدیریت اتصال (برای گوش دادن) -----
        Task ConnectAsync(string token); // Token will be retrieved internally
        Task DisconnectAsync();
        bool IsConnected { get; }

        // ----- متدهای دستوری (ارسال به API از طریق HTTP) -----
        Task<bool> SendMessageViaApiAsync(SendMessageRequestDto request, string token);
        Task SendMessageToGroupAsync(int groupId, string messageText, string groupType, long? replyToMessageId = null, List<long>? fileAttachementIds = null);
        Task EditMessageAsync(long messageId, string newText, int groupId, string groupType, List<long>? fileIds, List<long>? fileIdsToRemove);
        
        Task SendTypingSignalAsync(int groupId, string groupType);
        Task SendStopTypingSignalAsync(int groupId, string groupType);
        Task MarkMessageAsReadAsync(int groupId, string groupType, long messageId);
        Task DeleteMessageAsync(int groupId, string groupType, long messageId);
        Task<List<object>> GetUsersWithStatusAsync(string groupId, string groupType);


        event Func<object, Task> OnReceiveMessage; // payload: defined in ChatHub
        event Func<object, Task> OnReceiveEditedMessage; // payload: defined in ChatHub for edited messages
        event Func<long, string, int, Task> OnUserTyping; // userId, userName, groupId
        event Func<long, int, Task> OnUserStoppedTyping; // userId, groupId
        event Func<long, bool, int, string, Task> OnUserStatusChanged; // userId, isOnline, groupId, groupType
        event Func<long, long, int, string, string, Task> OnMessageReadByRecipient; // messageId, readerUserId, groupId, groupType, readerFullName
        event Func<long, int, string, Task> OnMessageSuccessfullyMarkedAsRead; // messageId, groupId, groupType (confirmation for the reader)
        event Func<long, bool, Task> OnMessageDeleted; // messageId, success
    }
}
