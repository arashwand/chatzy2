using Messenger.DTOs;
using Messenger.WebApp.Models.ViewModels;
using System.Security.Claims;

namespace Messenger.WebApp.Services
{
    public class MessageService : IMessageService
    {
        public async Task<InitialChatDataViewModel> GetInitialChatDataAsync(InitialChatDataRequest request, long userId)
        {
            // =================================================================
            //                 منطق شبیه‌سازی داینامیک
            // =================================================================

            // 1. شبیه‌سازی نتیجه همگام‌سازی (SyncResult)
            var syncResult = new SyncResultDto
            {
                EditedMessages = new List<MessageDto>(),
                DeletedMessageIds = new List<long>()
            };

            var clientIds = request.SyncRequest?.ClientMessageIds ?? new List<long>();
            if (clientIds.Any())
            {
                var random = new Random();
                if (clientIds.Count > 1)
                {
                    var idToDelete = clientIds[random.Next(clientIds.Count)];
                    syncResult.DeletedMessageIds.Add(idToDelete);
                }
                if (clientIds.Count > 2)
                {
                    var idToEdit = clientIds.Except(syncResult.DeletedMessageIds).FirstOrDefault();
                    if (idToEdit != 0)
                    {
                        syncResult.EditedMessages.Add(new MessageDto
                        {
                            MessageId = idToEdit,
                            MessageText = new MessageTextDto { MessageTxt = $"این یک پیام ویرایش شده (شبیه‌سازی شده) است. شناسه: {idToEdit}" },
                            SenderUserId = 2,
                            SenderUser = new UserDto { NameFamily = "کاربر ویرایشگر" },
                            MessageDateTime = DateTime.UtcNow
                        });
                    }
                }
            }

            // 2. شبیه‌سازی تعداد پیام‌های خوانده نشده و آخرین پیام خوانده شده
            var randomizer = new Random();
            var unreadCount = randomizer.Next(60, 151);
            var totalMessagesToGenerate = unreadCount + 100;

            var allMessages = GenerateFakeMessages(totalMessagesToGenerate, 1000, userId);

            long? lastReadMessageId = allMessages.ElementAtOrDefault(totalMessagesToGenerate - unreadCount - 1)?.MessageId;

            IEnumerable<MessageDto> messagesToReturn;
            bool isFromUnread = false;

            // 3. منطق هوشمند برای واکشی پیام‌ها
            if (unreadCount > 50)
            {
                isFromUnread = true;
                int firstUnreadIndex = allMessages.FindIndex(m => m.MessageId == lastReadMessageId) + 1;
                if (firstUnreadIndex <= 0) firstUnreadIndex = allMessages.Count - unreadCount;
                messagesToReturn = allMessages.Skip(firstUnreadIndex).Take(50).ToList();
            }
            else
            {
                messagesToReturn = allMessages.TakeLast(50).ToList();
            }

            return new InitialChatDataViewModel
            {
                SyncResult = syncResult,
                Messages = messagesToReturn,
                UnreadCount = unreadCount,
                LastReadMessageId = lastReadMessageId,
                IsFromUnread = isFromUnread
            };
        }

        private List<MessageDto> GenerateFakeMessages(int count, int startId, long currentUserId)
        {
            var messages = new List<MessageDto>();
            var random = new Random();
            var user1 = new UserDto { UserId = currentUserId, NameFamily = "شما" };
            var user2 = new UserDto { UserId = currentUserId + 1, NameFamily = "کاربر تستی" };

            for (int i = 0; i < count; i++)
            {
                var sender = random.Next(0, 2) == 0 ? user1 : user2;
                messages.Add(new MessageDto
                {
                    MessageId = startId + i,
                    MessageText = new MessageTextDto { MessageTxt = $"این پیام آزمایشی شماره {startId + i} است." },
                    SenderUserId = sender.UserId,
                    SenderUser = sender,
                    MessageDateTime = DateTime.UtcNow.AddMinutes(-count + i)
                });
            }
            return messages;
        }
    }
}
