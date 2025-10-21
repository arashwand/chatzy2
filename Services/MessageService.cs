using Messenger.DTOs;
using Microsoft.EntityFrameworkCore; // برای متدهای Include, AsNoTracking, ToListAsync
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Messenger.WebApp.Services
{
    public class MessageService : IMessageService
    {
        // اینجا باید DbContext واقعی پروژه وب‌سرویس خارجی جایگزین شود
        // به دلیل عدم دسترسی به آن پروژه، از یک نام جایگزین استفاده می‌کنیم
        // و فرض می‌کنیم از طریق DI تزریق می‌شود.
        private readonly DbContext _context;
        private readonly ILogger<MessageService> _logger;

        public MessageService(DbContext context, ILogger<MessageService> logger)
        {
            _context = context;
            _logger = logger;
        }

        // متد کمکی برای ساخت کوئری پایه پیام‌ها
        private IQueryable<Message> GetMessagesQuery()
        {
            // نام‌های Include شده فرضی هستند و باید با مدل واقعی Entity شما تطبیق داده شوند
            return _context.Set<Message>()
                .AsNoTracking()
                .Include("MessageTexts")
                .Include("SenderUser")
                .Include("ReplyMessage.MessageTexts")
                .Include("ReplyMessage.SenderUser")
                .Include("MessageFiles.File.FileExtension")
                .Include("MessageReads");
        }

        public async Task<SyncChatResult> SyncChatHistoryAsync(SyncChatRequest request, long currentUserId)
        {
            var result = new SyncChatResult();
            var clientMessageIdsAsLong = request.ClientMessageIds.Select(long.Parse).ToList();

            var query = GetMessagesQuery();

            // فیلتر کردن بر اساس نوع گروه
            switch (request.GroupType)
            {
                case "ClassGroup":
                    query = query.Where(m => m.ClassGroupMessages.Any(cg => cg.ClassId.ToString() == request.ChatId));
                    break;
                case "ChannelGroup":
                    query = query.Where(m => m.ChannelGroupMessages.Any(ch => ch.ChannelId.ToString() == request.ChatId));
                    break;
                default:
                    _logger.LogWarning("نوع گروه نامعتبر در SyncChatHistoryAsync: {GroupType}", request.GroupType);
                    throw new ArgumentException("نوع گروه نامعتبر است");
            }

            // ۱. یافتن پیام‌های حذف شده
            var deletedMessageIds = await _context.Set<Message>()
                .Where(m => clientMessageIdsAsLong.Contains(m.MessageId) && m.IsHidden == true)
                .Select(m => m.MessageId)
                .ToListAsync();
            result.DeletedMessageIds = deletedMessageIds;

            // ۲. یافتن پیام‌های ویرایش شده
            var editedMessages = await query
                .Where(m => clientMessageIdsAsLong.Contains(m.MessageId) && m.IsEdited == true && m.IsHidden == false)
                .ToListAsync();
            result.EditedMessages = MapMessagesToDto(editedMessages, currentUserId);

            // ۳. یافتن پیام‌های جدید
            var newMessages = await query
                .Where(m => m.MessageDateTime >= request.SyncFrom && m.MessageDateTime <= request.SyncTo && m.IsHidden == false)
                .Where(m => !clientMessageIdsAsLong.Contains(m.MessageId))
                .OrderBy(m => m.MessageDateTime)
                .ToListAsync();
            result.NewMessages = MapMessagesToDto(newMessages, currentUserId);

            return result;
        }

        // متد کمکی برای تبدیل لیست پیام‌ها به DTO
        private List<MessageDto> MapMessagesToDto(List<Message> messages, long currentUserId)
        {
            if (messages == null || !messages.Any())
            {
                return new List<MessageDto>();
            }

            return messages.Select(m => new MessageDto
            {
                MessageId = m.MessageId,
                SenderUserId = m.SenderUserId,
                MessageDateTime = m.MessageDateTime,
                MessageType = m.MessageType,
                IsHidden = m.IsHidden,
                IsPin = m.IsPin,
                IsEdited = m.IsEdited,
                MessageFiles = m.MessageFiles?.Select(mf => new MessageFileDto {
                    MessageId = mf.MessageId,
                    FileName = mf.File?.FileName,
                    FileSize = mf.File?.FileSize ?? 0,
                    FileType = mf.File?.FileExtension?.MimeType ?? "application/octet-stream"
                }).ToList(),
                MessageText = m.MessageTexts?.FirstOrDefault()?.Content,
                ReplyMessageId = m.ReplyMessageId,
                ReplyMessage = m.ReplyMessage == null ? null : new MessageDto
                {
                    MessageId = m.ReplyMessage.MessageId,
                    SenderUserId = m.ReplyMessage.SenderUserId,
                    MessageDateTime = m.ReplyMessage.MessageDateTime,
                    MessageText = m.ReplyMessage.MessageTexts?.FirstOrDefault()?.Content,
                    SenderUser = m.ReplyMessage.SenderUser == null ? null : new UserDto
                    {
                        UserId = m.ReplyMessage.SenderUser.UserId,
                        FullName = $"{m.ReplyMessage.SenderUser.FirstName} {m.ReplyMessage.SenderUser.LastName}"
                    }
                },
                SenderUser = m.SenderUser == null ? null : new UserDto
                {
                    UserId = m.SenderUser.UserId,
                    FullName = $"{m.SenderUser.FirstName} {m.SenderUser.LastName}",
                    ProfilePictureUrl = m.SenderUser.ProfilePictureUrl
                },
                IsReadByCurrentUser = m.MessageReads.Any(r => r.UserId == currentUserId),
                IsReadByAnyRecipient = (m.SenderUserId == currentUserId) && m.MessageReads.Any(mr => mr.UserId != currentUserId),
                MessageSeenCount = m.MessageReads.Count(r => r.UserId != currentUserId)
            }).ToList();
        }

        #region Placeholder Methods
        // این متدها باید در سرویس واقعی پیاده‌سازی شوند
        public Task<IEnumerable<MessageDto>> GetPrivateMessagesAsync(long userId, long otherUserId, int pageNumber, int pageSize)
        {
            _logger.LogWarning("متد GetPrivateMessagesAsync پیاده‌سازی نشده است.");
            return Task.FromResult(Enumerable.Empty<MessageDto>());
        }

        public Task<IEnumerable<MessageDto>> GetChannelMessagesAsync(int channelId, long userId, int pageNumber, int pageSize)
        {
            _logger.LogWarning("متد GetChannelMessagesAsync پیاده‌سازی نشده است.");
            return Task.FromResult(Enumerable.Empty<MessageDto>());
        }

        public Task<IEnumerable<MessageDto>> GetClassGroupMessagesAsync(int classId, long userId, int pageNumber, int pageSize, long messageId)
        {
             _logger.LogWarning("متد GetClassGroupMessagesAsync پیاده‌سازی نشده است.");
            return Task.FromResult(Enumerable.Empty<MessageDto>());
        }
        #endregion
    }

    #region Placeholder Entity Classes
    // این کلاس‌ها فقط برای جلوگیری از خطای کامپایل هستند و باید با مدل‌های واقعی جایگزین شوند
    public class Message {
        public long MessageId { get; set; }
        public long SenderUserId { get; set; }
        public DateTime MessageDateTime { get; set; }
        public int MessageType { get; set; }
        public bool IsHidden { get; set; }
        public bool IsPin { get; set; }
        public bool IsEdited { get; set; }
        public long? ReplyMessageId { get; set; }
        public User SenderUser { get; set; }
        public Message ReplyMessage { get; set; }
        public ICollection<MessageText> MessageTexts { get; set; }
        public ICollection<MessageFile> MessageFiles { get; set; }
        public ICollection<MessageRead> MessageReads { get; set; }
        public ICollection<ClassGroupMessage> ClassGroupMessages { get; set; }
        public ICollection<ChannelGroupMessage> ChannelGroupMessages { get; set; }
    }
    public class User {
        public long UserId { get; set; }
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string ProfilePictureUrl { get; set; }
    }
    public class MessageText { public string Content { get; set; } }
    public class MessageFile {
        public long MessageId { get; set; }
        public File File { get; set; }
    }
    public class File {
        public string FileName { get; set; }
        public long? FileSize { get; set; }
        public FileExtension FileExtension { get; set; }
    }
    public class FileExtension { public string MimeType { get; set; } }
    public class MessageRead { public long UserId { get; set; } }
    public class ClassGroupMessage { public int ClassId { get; set; } }
    public class ChannelGroupMessage { public int ChannelId { get; set; } }
    #endregion
}
