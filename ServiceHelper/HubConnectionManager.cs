using Azure.Core;
using Messenger.DTOs;
using Messenger.Models.Models;
using Messenger.Tools;
using Messenger.WebApp.Hubs;
using Messenger.WebApp.Models;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using System;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Messenger.WebApp.ServiceHelper
{
    /// <summary>
    /// مدیریت ارتباط با هاب اصلی که در وبسرویس قرار دارد
    /// </summary>
    public class HubConnectionManager : IRealtimeHubBridgeService, IAsyncDisposable
    {
        private HubConnection _hubConnection;
        private readonly ILogger<HubConnectionManager> _logger;
        private readonly string _hubUrl;
        private readonly string _baseUrl;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IHubContext<WebAppChatHub> _webAppHubContext;
        private readonly IConfiguration _configuration;
        private readonly SemaphoreSlim _connectionLock = new SemaphoreSlim(1, 1);

        public string ClientConnectionId => _hubConnection?.ConnectionId;
        // IsConnected همچنان برای بررسی وضعیت استفاده می‌شود
        public bool IsConnected => _hubConnection?.State == HubConnectionState.Connected;

        public event Func<object, Task> OnReceiveMessage;
        public event Func<object, Task> OnReceiveEditedMessage;

        public HubConnectionManager(ILogger<HubConnectionManager> logger,
            IOptions<ApiSettings> apiSettings,
            IHubContext<WebAppChatHub> webAppHubContext,
            IConfiguration configuration, IHttpClientFactory httpClientFactory)
        {
            _logger = logger;
            _hubUrl = $"{apiSettings.Value.BaseUrl.TrimEnd('/')}/chathub";
            _baseUrl = $"{apiSettings.Value.UploadPath}";
            _httpClientFactory = httpClientFactory;
            _webAppHubContext = webAppHubContext;
            _configuration = configuration;
            _logger.LogInformation("HubConnectionManager initialized. Hub URL: {HubUrl}", _hubUrl);
        }


        public async Task ConnectWithRetryAsync(CancellationToken cancellationToken)
        {
            if (IsConnected) return;

            await _connectionLock.WaitAsync(cancellationToken);
            try
            {
                if (IsConnected) return;

                _logger.LogInformation("HubConnectionManager attempting to connect...");

                // ۱. درخواست توکن از SSO (این متد در ادامه کلاس وجود دارد)
                var accessToken = await RequestSsoTokenAsync();
                if (string.IsNullOrEmpty(accessToken))
                {
                    _logger.LogCritical("Could not obtain token from SSO. Connection attempt aborted.");
                    return;
                }

                // ۲. ساخت اتصال با توکن
                _hubConnection = new HubConnectionBuilder()
                    .WithUrl(_hubUrl, options =>
                    {
                        options.AccessTokenProvider = () => Task.FromResult(accessToken);
                    })
                    .WithAutomaticReconnect()
                    .Build();

                // ۳. ثبت رویدادها
                RegisterHubEventHandlers();

                // ۴. تلاش برای اتصال
                await _hubConnection.StartAsync(cancellationToken);
                _logger.LogInformation("HubConnectionManager connected to API Hub successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to connect to API hub.");
                // در صورت خطا، اتصال را برای تلاش بعدی پاک می‌کنیم
                if (_hubConnection != null)
                {
                    await _hubConnection.DisposeAsync();
                    _hubConnection = null;
                }
            }
            finally
            {
                _connectionLock.Release();
            }
        }

        public async Task ConnectAsync(string token)
        {
            if (IsConnected) return;

            await _connectionLock.WaitAsync();
            try
            {
                if (IsConnected) return;

                if (string.IsNullOrEmpty(token))
                {
                    _logger.LogWarning("SignalR connection token is missing. Cannot connect.");
                    return;
                }

                _hubConnection = new HubConnectionBuilder()
                    .WithUrl(_hubUrl, options => { options.AccessTokenProvider = () => Task.FromResult(token); })
                    .WithAutomaticReconnect()
                    .Build();

                RegisterHubEventHandlers();
                await _hubConnection.StartAsync();
                _logger.LogInformation("Successfully connected to SignalR hub. Connection ID: {ConnectionId}", _hubConnection.ConnectionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error connecting to SignalR hub.");
            }
            finally
            {
                _connectionLock.Release();
            }
        }

        public async Task DisconnectAsync()
        {
            if (!IsConnected) return;
            try
            {
                await _hubConnection.StopAsync();
                await _hubConnection.DisposeAsync();
                _hubConnection = null;
                _logger.LogInformation("Successfully disconnected from SignalR hub.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error disconnecting from SignalR hub.");
            }
        }


        public Task<List<object>> GetUsersWithStatusAsync(string groupId, string groupType)
            => InvokeHubMethodWithResultAsync<List<object>>("GetUsersWithStatus", groupId, groupType);

        // جهت انلاین نمودن کاربر
        public Task AnnounceUserPresenceAsync(long userId)
                    => InvokeHubMethodAsync("AnnouncePresence", userId);

        public Task AnnounceUserDepartureAsync(long userId)
                    => InvokeHubMethodAsync("AnnounceDeparture", userId);

        public Task SendHeartbeatAsync(long userId)
                    => InvokeHubMethodAsync("SendHeartbeat", userId);

        public Task SendTypingSignalAsync(long userId, int groupId, string groupType)
            => InvokeHubMethodAsync("Typing", userId, groupId, groupType);

        public Task SendStopTypingSignalAsync(long userId, int groupId, string groupType)
            => InvokeHubMethodAsync("StopTyping", userId, groupId, groupType);

        public Task MarkMessageAsReadAsync(long userId, int groupId, string groupType, long messageId)
            => InvokeHubMethodAsync("MarkMessageAsRead", userId, groupId, groupType, messageId);

        public Task MarkAllMessagesAsReadAsync(long userId, int groupId, string groupType)
            => InvokeHubMethodAsync("MarkAllMessagesAsRead", userId, groupId, groupType);

        /// <summary>
        /// درخواست محاسبه پیامهای خوانده نشده هر چت
        /// </summary>
        /// <param name="userId"></param>
        /// <returns></returns>
        public Task RequestUnreadCounts(long userId)
            => InvokeHubMethodAsync("RequestUnreadCounts", userId);




        #region Private Methods 

        private void RegisterHubEventHandlers()
        {
            _hubConnection.On<object[]>("ReceiveMessage", async (payload) =>
            {
                /// <summary>
                /// هندلر برای دریافت پیام معمولی
                /// از متدهای کمکی برای deserialize و ساخت payload استفاده می‌کند
                /// </summary>
                _logger.LogDebug("API Hub: ReceiveMessage event triggered with {Count} elements.", payload.Length);

                try
                {
                    MessageDto messageDto;
                    int groupId;
                    string groupType;

                    if (payload.Length == 3)
                    {
                        var messageDtoObj = payload[0];
                        groupId = GetInt32FromPayload(payload[1]);
                        groupType = GetStringFromPayload(payload[2]);

                        messageDto = DeserializeMessageDto(messageDtoObj);
                    }
                    else if (payload.Length == 1)
                    {
                        var messageDtoObj = payload[0];

                        messageDto = DeserializeMessageDto(messageDtoObj);

                        groupId = messageDto.ClassGroupId;
                        groupType = messageDto.MessageType == 0 ? ConstChat.ClassGroupType : ConstChat.ChannelGroupType;
                    }
                    else
                    {
                        _logger.LogError("Invalid payload for ReceiveMessage: expected 1 or 3 elements, got {Count}", payload.Length);
                        return;
                    }

                    _logger.LogInformation("Bridge received ReceiveMessage: MessageId={MessageId}, Type={Type}, ReceiverUserId={Receiver}",
                        messageDto.MessageId, messageDto.MessageType, messageDto.ReceiverUserId);

                    var payload2 = CreateReceiveMessagePayload(messageDto, groupId, groupType);

                    // ارسال به همه کلاینت‌های WebApp یا به کاربر خاص برای پیام خصوصی
                    if (messageDto.MessageType == (byte)EnumMessageType.Private && messageDto.ReceiverUserId.HasValue)
                    {
                        await _webAppHubContext.Clients.User(messageDto.ReceiverUserId.Value.ToString()).SendAsync("ReceiveMessage", payload2);
                        await _webAppHubContext.Clients.User(messageDto.SenderUserId.ToString()).SendAsync("ReceiveMessage", payload2); // ارسال به فرستنده هم
                    }
                    else
                    {
                        await _webAppHubContext.Clients.All.SendAsync("ReceiveMessage", payload2);
                    }
                    OnReceiveMessage?.Invoke(payload2);
                }
                catch (System.Text.Json.JsonException ex)
                {
                    _logger.LogError(ex, "خطا در تبدیل JSON");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "خطای عمومی در ReceiveMessage");
                }
            });

            _hubConnection.On<object[]>("ReceiveEditedMessage", async (payload) =>
            {
                /// <summary>
                /// هندلر برای دریافت پیام ویرایش شده
                /// از متدهای کمکی برای deserialize و ساخت payload استفاده می‌کند
                /// </summary>
                _logger.LogDebug("API Hub: ReceiveEditedMessage event triggered with {Count} elements.", payload.Length);

                try
                {
                    MessageDto messageDto;
                    int groupId;
                    string groupType;

                    if (payload.Length == 3)
                    {
                        var messageDtoObj = payload[0];
                        groupId = GetInt32FromPayload(payload[1]);
                        groupType = GetStringFromPayload(payload[2]);

                        messageDto = DeserializeMessageDto(messageDtoObj);
                    }
                    else if (payload.Length == 1)
                    {
                        var messageDtoObj = payload[0];

                        messageDto = DeserializeMessageDto(messageDtoObj);

                        groupId = messageDto.ClassGroupId;
                        groupType = messageDto.MessageType == 0 ? ConstChat.ClassGroupType : ConstChat.ChannelGroupType;
                    }
                    else
                    {
                        _logger.LogError("Invalid payload for ReceiveEditedMessage: expected 1 or 3 elements, got {Count}", payload.Length);
                        return;
                    }

                    var payload2 = CreateReceiveMessagePayload(messageDto, groupId, groupType);

                    // ارسال به همه کلاینت‌های WebApp یا به کاربر خاص برای پیام خصوصی
                    if (messageDto.MessageType == (byte)EnumMessageType.Private && messageDto.ReceiverUserId.HasValue)
                    {
                        await _webAppHubContext.Clients.User(messageDto.ReceiverUserId.Value.ToString()).SendAsync("ReceiveEditedMessage", payload2);
                        await _webAppHubContext.Clients.User(messageDto.SenderUserId.ToString()).SendAsync("ReceiveEditedMessage", payload2); // ارسال به فرستنده هم
                    }
                    else
                    {
                        await _webAppHubContext.Clients.All.SendAsync("ReceiveEditedMessage", payload2);
                    }
                    OnReceiveMessage?.Invoke(payload2);
                }
                catch (System.Text.Json.JsonException ex)
                {
                    _logger.LogError(ex, "خطا در تبدیل JSON");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "خطای عمومی در ReceiveEditedMessage");
                }

                OnReceiveEditedMessage?.Invoke(payload);
            });

            _hubConnection.On<long, bool>("UserDeleteMessage", async (messageId, isHidden) =>
            {
                await _webAppHubContext.Clients.All.SendAsync("UserDeleteMessage", messageId, isHidden);
            });

            // رویداد UserTyping - تصحیح شده
            _hubConnection.On<object[]>("UserTyping", async (payload) =>
            {
                if (payload.Length >= 3)
                {
                    try
                    {
                        var userId = GetInt64FromPayload(payload[0]);
                        var userName = GetStringFromPayload(payload[1]) ?? "-";
                        var groupId = GetInt32FromPayload(payload[2]);

                        _logger.LogInformation("UserTyping event received: userId={UserId}, userName={UserName}, groupId={GroupId}", userId, userName, groupId);
                        await _webAppHubContext.Clients.All.SendAsync("UserTyping", userId, userName, groupId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error processing UserTyping event");
                    }
                }
                else
                {
                    _logger.LogError("Invalid UserTyping payload: expected 3 elements, got {Count}", payload.Length);
                }
            });

            // رویداد UserStoppedTyping - جدید اضافه شده
            _hubConnection.On<object[]>("UserStoppedTyping", async (payload) =>
            {
                if (payload.Length >= 2)
                {
                    try
                    {
                        var userId = GetInt64FromPayload(payload[0]);
                        var groupId = GetInt32FromPayload(payload[1]);

                        _logger.LogInformation("UserStoppedTyping event received: userId={UserId}, groupId={GroupId}", userId, groupId);
                        await _webAppHubContext.Clients.All.SendAsync("UserStoppedTyping", userId, groupId);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error processing UserStoppedTyping event");
                    }
                }
                else
                {
                    _logger.LogError("Invalid UserStoppedTyping payload: expected 2 elements, got {Count}", payload.Length);
                }
            });

            _hubConnection.On<object[]>("MessageSeenUpdate", async (payload) =>
            {
                if (payload.Length >= 4)
                {
                    try
                    {
                        var messageId = GetInt64FromPayload(payload[0]);
                        var readerUserId = GetInt64FromPayload(payload[1]);
                        var seenCount = GetInt32FromPayload(payload[2]);
                        var readerFullName = GetStringFromPayload(payload[3]) ?? "";

                        _logger.LogInformation("MessageSeenUpdate event received: messageId={MessageId}, readerUserId={ReaderUserId}, seenCount={SeenCount}",
                            messageId, readerUserId, seenCount);

                        await _webAppHubContext.Clients.All.SendAsync("MessageSeenUpdate", messageId, readerUserId, seenCount, readerFullName);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error processing MessageSeenUpdate event");
                    }
                }
                else
                {
                    _logger.LogError("Invalid MessageSeenUpdate payload: expected 4 elements, got {Count}", payload.Length);
                }
            });

            //اطلاع نتیجه به کاربر ضبط کننده صدا
            _hubConnection.On<string, bool, long, double, string, string>("ReceiveVoiceMessageResult", async (userId, success, fileId, duration, durationFormated, recordingId) =>
            {
                await _webAppHubContext.Clients.User(userId).SendAsync("ReceiveVoiceMessageResult", success, fileId, duration, durationFormated, recordingId);
            });

            // رویداد دریافت تعداد پیام خوانده نشده در چت
            _hubConnection.On<long, string, int>("UpdateUnreadCount", async (userId, key, unreadCount) =>
            {
                // Forward to the specific user
                await _webAppHubContext.Clients.User(userId.ToString())
                    .SendAsync("UpdateUnreadCount", key, unreadCount);
            });

            // این رویداد فقط برای تایید ارسال موفق پیام به خود فرستنده است
            _hubConnection.On<MessageDto>("MessageSentSuccessfully", async (savedMessage) =>
            {
                _logger.LogInformation($"Bridge received 'MessageSentSuccessfully' for client message {savedMessage.MessageId}");

                // پیدا کردن شناسه کاربری که پیام را فرستاده
                var userId = savedMessage.SenderUserId.ToString();

                // create json object for update user message
                var messageDetailsJson = CreateJsonMessageDetails(savedMessage);

                // پیام تایید را فقط به همان کاربر خاص در WebAppChatHub ارسال کنید
                await _webAppHubContext.Clients.User(userId)
                    .SendAsync("MessageSentSuccessfully", savedMessage, messageDetailsJson);
            });

            // این رویداد فقط برای تایید ویرایش موفق پیام به خود فرستنده است
            _hubConnection.On<MessageDto>("EditMessageSentSuccessfully", async (savedMessage) =>
            {
                _logger.LogInformation($"Bridge received 'EditMessageSentSuccessfully' for client message {savedMessage.MessageId}");

                // پیدا کردن شناسه کاربری که پیام را فرستاده
                var userId = savedMessage.SenderUserId.ToString();

                var messageDetailsJson = CreateJsonMessageDetails(savedMessage);
                // پیام تایید را فقط به همان کاربر خاص در WebAppChatHub ارسال کنید
                await _webAppHubContext.Clients.User(userId)
                        .SendAsync("EditMessageSentSuccessfully", savedMessage, messageDetailsJson);
            });


            // به ارسال کننده پیام اطلاع میدهد که پیام ارسالی با خطا مواجه شده است
            // در ویرایش پیام هم همین متد فراخوانی میشه
            _hubConnection.On<long, string>("SendMessageError", async (userId, clientMessageId) =>
            {
                _logger.LogInformation($"Bridge received 'SendMessageError' for client message {clientMessageId}");

                // پیدا کردن شناسه کاربری که پیام را فرستاده
                //var userId = savedMessage.SenderUserId.ToString();

                // پیام تایید را فقط به همان کاربر خاص در WebAppChatHub ارسال کنید
                await _webAppHubContext.Clients.User(userId.ToString())
                    .SendAsync("MessageSentFailed", clientMessageId);
            });


            // به ویرایش کننده پیام اطلاع میدهد که پیام ارسالی با خطا مواجه شده است
            // در ویرایش پیام هم همین متد فراخوانی میشه
            _hubConnection.On<long, long, string>("EditMessageSentFailed", async (userId, messageId, errorMessage) =>
            {
                _logger.LogInformation($"Bridge received 'SendMessageError' for client message {messageId}");

                // پیدا کردن شناسه کاربری که پیام را فرستاده
                //var userId = savedMessage.SenderUserId.ToString();

                // پیام تایید را فقط به همان کاربر خاص در WebAppChatHub ارسال کنید
                await _webAppHubContext.Clients.User(userId.ToString())
                    .SendAsync("EditMessageSentFailed", messageId);
            });


            _hubConnection.On<long, int, string, int>("MessageSuccessfullyMarkedAsRead", async (messageId, groupId, groupType, unreadCount) =>
            {
                if (groupId > 0)
                {
                    groupType = groupType == ConstChat.ClassGroupType ? ConstChat.ClassGroupType : groupType;
                    await _webAppHubContext.Clients.Group(groupId.ToString()).SendAsync("MessageSuccessfullyMarkedAsRead", messageId, groupId, groupType, unreadCount);
                }
                else
                {
                    _logger.LogDebug("MessageSuccessfullyMarkedAsRead groupId < 0 !!! " + groupId);
                }
            });


            _hubConnection.On<List<long>, int, string, int>("AllUnreadMessagesSuccessfullyMarkedAsRead", async (messageIds, groupId, groupType, unreadCount) =>
            {
                await _webAppHubContext.Clients.All.SendAsync("AllUnreadMessagesSuccessfullyMarkedAsRead", messageIds, groupId, groupType, unreadCount);
            });


            //--وقتی پیام توسط دیگران خوانده شد اطلاعات خواننده را برای ارسال کننده پیام بروزرسانی میکنه
            _hubConnection.On<long, long, string>("MessageReadByRecipient", async (messageId, senderUserId, readerFullName) =>
            {
                await _webAppHubContext.Clients.User(senderUserId.ToString()).SendAsync("MessageReadByRecipient", messageId, senderUserId, readerFullName);

            });



            _hubConnection.On<long, bool, int, string>("UserStatusChanged", async (userId, isOnline, groupId, groupType) =>
            {
                _logger.LogInformation($"STEP 6: Bridge received UserStatusChanged for UserId: {userId}, IsOnline: {isOnline}, GroupId: {groupId}");

                _logger.LogDebug("API Hub: UserStatusChanged event for UserId: {UserId}, GroupId: {GroupId}", userId, groupId);

                // ارسال وضعیت فقط به اعضای همان گروه
                if (groupId > 0)
                {
                    await _webAppHubContext.Clients.Group(groupId.ToString()).SendAsync("UserStatusChanged", userId, isOnline, groupId, groupType);
                }
            });

            // Handler for broadcasting to groups
            _hubConnection.On<object[]>("BroadcastToGroups", async (payload) =>
            {
                _logger.LogDebug("API Hub: BroadcastToGroups event triggered with {Count} elements.", payload.Length);

                // قبول 2 یا 3 المنت (نسخه قدیمی 2 تایی و نسخه جدید 3 تایی شامل targetIds)
                if (payload.Length is < 2 or > 3)
                {
                    _logger.LogError("Invalid payload for BroadcastToGroups: expected 2 or 3 elements, got {Count}", payload.Length);
                    return;
                }

                try
                {
                    var messageDtoObj = payload[0];
                    var messageType = GetInt32FromPayload(payload[1]);

                    IEnumerable<int> targetIds = Enumerable.Empty<int>();

                    if (payload.Length == 3)
                    {
                        // تلاش برای استخراج آرایه targetIds حتی اگر JsonElement باشد
                        var rawTargetIds = payload[2];
                        targetIds = ParseIntArray(rawTargetIds);
                    }

                    var groupType = "";
                    if (messageType == (int)EnumMessageType.Group || messageType == (int)EnumMessageType.Channel)
                    {
                        groupType = messageType == (int)EnumMessageType.Group ? ConstChat.ClassGroupType : ConstChat.ChannelGroupType;
                    }
                    else
                    {
                        groupType = messageType == (int)EnumMessageType.AllGroups ? ConstChat.ClassGroupType : ConstChat.ChannelGroupType;
                    }

                    var messageDto = DeserializeMessageDto(messageDtoObj);

                    foreach (var groupId in targetIds)
                    {
                        var payload2 = CreateReceiveMessagePayload(messageDto, groupId, groupType);

                        //--برای اینکه پیام به همه اعضای گروه ارسال بشه همچنین بر روی همه چت ها هم بروزرسانی بشه باید از  Clients.All استفاده کنیم

                        await _webAppHubContext.Clients.All.SendAsync("ReceiveMessage", payload2);
                        OnReceiveMessage?.Invoke(payload2);
                    }
                }
                catch (System.Text.Json.JsonException ex)
                {
                    _logger.LogError(ex, "خطا در تبدیل JSON در BroadcastToGroups");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "خطای عمومی در BroadcastToGroups");
                }
            });

            // Handler for broadcasting to users
            _hubConnection.On<object[]>("BroadcastToUsers", async (payload) =>
            {
                _logger.LogDebug("API Hub: BroadcastToUsers event triggered with {Count} elements.", payload.Length);

                if (payload.Length is < 2 or > 3)
                {
                    _logger.LogError("Invalid payload for BroadcastToUsers: expected 2 or 3 elements, got {Count}", payload.Length);
                    return;
                }

                try
                {
                    var messageDtoObj = payload[0];
                    var messageType = GetInt32FromPayload(payload[1]); // فعلاً استفاده‌ای ندارد ولی حفظ می‌کنیم

                    IEnumerable<long> targetIds = Enumerable.Empty<long>();
                    if (payload.Length == 3)
                    {
                        var rawTargetIds = payload[2];
                        targetIds = ParseLongArray(rawTargetIds);
                    }

                    var messageDto = DeserializeMessageDto(messageDtoObj);

                    if (!targetIds.Any())
                    {
                        // نسخه قدیمی بدون لیست هدف (fallback)
                        var payload2 = CreateReceiveMessagePayload(messageDto, 0, "");
                        await _webAppHubContext.Clients.All.SendAsync("ReceiveMessage", payload2);
                        OnReceiveMessage?.Invoke(payload2);
                        return;
                    }

                    foreach (var userId in targetIds)
                    {
                        var payload2 = CreateReceiveMessagePayload(messageDto, 0, "");
                        await _webAppHubContext.Clients.User(userId.ToString()).SendAsync("ReceiveMessage", payload2);
                        OnReceiveMessage?.Invoke(payload2);
                    }
                }
                catch (System.Text.Json.JsonException ex)
                {
                    _logger.LogError(ex, "خطا در تبدیل JSON در BroadcastToUsers");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "خطای عمومی در BroadcastToUsers");
                }
            });

        }

        /// <summary>
        /// تبدیل شیء messageDtoObj به MessageDto با استفاده از JsonSerializer
        /// </summary>
        /// <param name="messageDtoObj">شیء ورودی که باید deserialize شود</param>
        /// <returns>شیء MessageDto deserialize شده</returns>
        private MessageDto DeserializeMessageDto(object messageDtoObj)
        {
            var options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };

            string jsonString = System.Text.Json.JsonSerializer.Serialize(messageDtoObj, options);
            return System.Text.Json.JsonSerializer.Deserialize<MessageDto>(jsonString, options);
        }

        /// <summary>
        /// ایجاد payload برای ارسال پیام دریافتی به کلاینت‌های WebApp
        /// شامل اطلاعات پیام، پاسخ، فایل‌ها و جزئیات JSON
        /// </summary>
        /// <param name="messageDto">شیء MessageDto</param>
        /// <param name="groupId">شناسه گروه</param>
        /// <param name="groupType">نوع گروه</param>
        /// <returns>شیء payload برای ارسال</returns>
        private object CreateReceiveMessagePayload(MessageDto messageDto, int groupId, string groupType)
        {
            object replyMessage = null;
            if (messageDto.ReplyMessageId != null && messageDto.ReplyMessage != null)
            {
                replyMessage = new
                {
                    replyToMessageId = messageDto.ReplyMessageId,
                    senderUserName = messageDto.ReplyMessage.SenderUser?.NameFamily,
                    messageText = messageDto.ReplyMessage.MessageText?.MessageTxt,
                    messageFiles = messageDto.ReplyMessage.MessageFiles
                };
            }

            object messageFiles = null;
            if (messageDto.MessageFiles != null && messageDto.MessageFiles.Any())
            {
                messageFiles = messageDto.MessageFiles.Select(mf => new
                {
                    FileName = mf.FileName,
                    FileThumbPath = mf.FileThumbPath,
                    FileSize = mf.FileSize,
                    MessageFileId = mf.MessageFileId
                }).ToList();
            }

            var messageDetailsJson = CreateJsonMessageDetails(messageDto);

            return new
            {
                senderUserId = messageDto.SenderUserId,
                senderUserName = messageDto.SenderUser?.NameFamily,
                messageText = messageDto.MessageText?.MessageTxt ?? "",
                groupId = groupId,
                groupType = groupType,
                messageDateTime = messageDto.MessageDateTime.ToString("HH:mm"),
                messageDate = messageDto.MessageDateTime,
                profilePicName = messageDto.SenderUser?.ProfilePicName,
                messageId = messageDto.MessageId,
                replyToMessageId = messageDto.ReplyMessageId,
                replyMessage,
                messageFiles,
                jsonMessageDetails = messageDetailsJson,
                IsSystemMessage = messageDto.IsSystemMessage
            };
        }

        private object CreateJsonMessageDetails(MessageDto savedMessage)
        {
            object messageDetailsForEdit = new
            {
                messageText = savedMessage.MessageText?.MessageTxt,
                replyToMessageId = savedMessage.ReplyMessageId,
                // فقط در صورتی که پاسخ وجود دارد، اطلاعات آن را اضافه کن
                replyMessage = savedMessage.ReplyMessageId != null ? new
                {
                    senderUserName = savedMessage.ReplyMessage?.SenderUser?.NameFamily,
                    messageText = savedMessage.ReplyMessage?.MessageText?.MessageTxt
                } : null,
                // اطلاعات فایل‌ها را به صورت یک لیست از آبجکت‌ها اضافه کن
                messageFiles = savedMessage.MessageFiles?.Select(f => new
                {
                    messageFileId = f.MessageFileId, // شناسه فایل در دیتابیس
                    fileName = f.FileName,
                    fileThumbPath = f.FileThumbPath,
                    filePath = f.FilePath,
                    originalFileName = f.OriginalFileName
                })
            };

            // 2. سریال‌سازی آبجکت بالا به یک رشته JSON
            var messageDetailsJson = JsonConvert.SerializeObject(messageDetailsForEdit);
            return messageDetailsJson;
        }

        private async Task<T> InvokeHubMethodWithResultAsync<T>(string methodName, params object[] args)
        {
            if (!IsConnected) throw new InvalidOperationException("Not connected to SignalR hub.");
            try
            {
                return await _hubConnection.InvokeCoreAsync<T>(methodName, args);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error invoking hub method {MethodName} for result.", methodName);
                throw;
            }
        }

        private async Task<string> RequestSsoTokenAsync()
        {
            try
            {
                // ... منطق کامل شما ...
                var ssoClient = _httpClientFactory.CreateClient();
                var ssoSettings = _configuration.GetSection("SsoSettings");

                var clientId = ssoSettings["ClientId"];
                var clientSecret = ssoSettings["ClientSecret"];

                var audience = ssoSettings["Audience"];

                // ۱. ساخت توکن Basic Authentication
                var authValue = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{clientId}:{clientSecret}"));
                ssoClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", authValue);

                // ۲. بدنه درخواست فقط شامل grant_type و scope خواهد بود
                var requestData = new Dictionary<string, string>
                {
                    ["grant_type"] = "client_credentials",
                    ["Scope"] = ssoSettings["Scope"],
                    ["Audience"] = audience
                };

                var response = await ssoClient.PostAsync(ssoSettings["TokenEndpoint"], new FormUrlEncodedContent(requestData));

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError("SSO token request failed with status: {StatusCode}", response.StatusCode);
                    return null;
                }
                // در انتهای متد:
                var responseContent = await response.Content.ReadFromJsonAsync<SsoTokenResponse>();
                var token = responseContent?.access_token;

                _logger.LogInformation("Successfully obtained access token from SSO.");
                return token;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Exception while requesting SSO token.");
                return null;
            }
        }

        private async Task InvokeHubMethodAsync(string methodName, params object[] args)
        {
            if (!IsConnected)
            {
                _logger.LogWarning("Cannot invoke '{MethodName}'. Hub is not connected.", methodName);
                return; // یا throw exception
            }
            try
            {
                await _hubConnection.InvokeCoreAsync(methodName, args);
            }
            catch (InvalidOperationException ex) when (ex.Message.Contains("cannot be called if the connection is not active"))
            {
                _logger.LogWarning(ex, "Connection is not active while invoking '{MethodName}'. Skipping.", methodName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error invoking hub method {MethodName}", methodName);
                throw;
            }
        }

        /// <summary>
        /// تبدیل JsonElement به long
        /// </summary>
        private static long GetInt64FromPayload(object value)
        {
            return value is System.Text.Json.JsonElement je ? je.GetInt64() : Convert.ToInt64(value);
        }

        /// <summary>
        /// تبدیل JsonElement به int
        /// </summary>
        private static int GetInt32FromPayload(object value)
        {
            return value is System.Text.Json.JsonElement je ? je.GetInt32() : Convert.ToInt32(value);
        }

        /// <summary>
        /// تبدیل JsonElement به string
        /// </summary>
        private static string GetStringFromPayload(object value)
        {
            return value is System.Text.Json.JsonElement je ? je.GetString() : value?.ToString();
        }

        /// <summary>
        /// لیست connectionId های کاربر در WebAppChatHub را برمی‌گرداند
        /// برای جلوگیری از ارسال پیام به خود فرستنده
        /// </summary>
        private List<string> GetCurrentWebAppConnections(long userId)
        {
            // در WebApp ممکن است کاربر چند تب باز داشته باشد
            // اما برای سادگی فعلاً لیست خالی برمی‌گردانیم
            // چون Clients.User(userId) خودش این کار را انجام می‌دهد
            // TODO: اگر نیاز به ردیابی دقیق connectionها بود، باید یک dictionary نگهداری شود
            return new List<string>();
        }

        private static IEnumerable<int> ParseIntArray(object raw)
        {
            if (raw is IEnumerable<int> ints) return ints;
            if (raw is System.Text.Json.JsonElement je && je.ValueKind == JsonValueKind.Array)
            {
                var list = new List<int>();
                foreach (var item in je.EnumerateArray())
                    if (item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var v)) list.Add(v);
                return list;
            }
            if (raw is IEnumerable<object> objs)
            {
                var list = new List<int>();
                foreach (var o in objs)
                {
                    try { list.Add(Convert.ToInt32(o)); } catch { }
                }
                return list;
            }
            return Enumerable.Empty<int>();
        }

        private static IEnumerable<long> ParseLongArray(object raw)
        {
            if (raw is IEnumerable<long> longs) return longs;
            if (raw is System.Text.Json.JsonElement je && je.ValueKind == JsonValueKind.Array)
            {
                var list = new List<long>();
                foreach (var item in je.EnumerateArray())
                    if (item.ValueKind == JsonValueKind.Number && item.TryGetInt64(out var v)) list.Add(v);
                return list;
            }
            if (raw is IEnumerable<object> objs)
            {
                var list = new List<long>();
                foreach (var o in objs)
                {
                    try { list.Add(Convert.ToInt64(o)); } catch { }
                }
                return list;
            }
            return Enumerable.Empty<long>();
        }

        #endregion

        public Task SendMessageAsync(SendMessageRequestDto request) => InvokeHubMethodAsync("SendMessage", request);

        public Task EditMessageAsync(EditMessageRequestDto request) => InvokeHubMethodAsync("EditMessage", request);



        // متد Dispose برای آزادسازی منابع
        public async ValueTask DisposeAsync()
        {
            if (_hubConnection != null)
            {
                await _hubConnection.DisposeAsync();
            }
        }
    }
}
