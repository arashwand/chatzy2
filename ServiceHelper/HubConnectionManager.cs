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

        // تمام متدهای ارسال و دریافت و منطق‌های دیگر از فایل قبلی
        // به اینجا کپی می‌شوند، بدون هیچ تغییری.
        // شامل:
        // - RegisterHubEventHandlers()
        // - SendMessageAsync()
        // - SendTypingSignalAsync()
        // - InvokeHubMethodAsync()
        // - RequestSsoTokenAsync()
        // و تمام متدهای دیگر...
        // (برای خلاصه‌سازی، کل آن متدها را اینجا کپی نمی‌کنم ولی شما باید آنها را از فایل قبلی به اینجا منتقل کنید)

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


        #region Private Methods 

        private void RegisterHubEventHandlers()
        {
            _hubConnection.On<object>("ReceiveMessage", async (payload) =>
            {
                _logger.LogDebug("API Hub: ReceiveMessage event triggered.");

                try
                {
                    // تنظیمات برای نگاشت نام‌های CamelCase به PascalCase
                    var options = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase // JSON با حروف کوچک
                    };

                    // تبدیل payload به JSON string
                    string jsonString = System.Text.Json.JsonSerializer.Serialize(payload, options);

                    // دسريالايز کردن به MessageDto با تنظیمات CamelCase
                    MessageDto messageDto = System.Text.Json.JsonSerializer.Deserialize<MessageDto>(jsonString, options);

                    // پردازش replyMessage
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

                    // پردازش messageFiles
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

                    //ساخت ابجکت جی سان جهت ارسال به صفحه
                    var messageDetailsJson = CreateJsonMessageDetails(messageDto);

                    // مشخص کردن نوع چت: گروه یا کانال
                    var chatType = messageDto.MessageType == 0 ? ConstChat.ClassGroupType : ConstChat.ChannelGroupType;
                    // ساخت payload2 برای ارسال
                    var payload2 = new
                    {
                        senderUserId = messageDto.SenderUserId,
                        senderUserName = messageDto.SenderUser?.NameFamily,
                        messageText = messageDto.MessageText?.MessageTxt ?? "",
                        groupId = messageDto.ClassGroupId,
                        groupType = chatType,
                        messageDateTime = messageDto.MessageDateTime.ToString("HH:mm"),
                        profilePicName = messageDto.SenderUser?.ProfilePicName,
                        messageId = messageDto.MessageId,
                        replyToMessageId = messageDto.ReplyMessageId,
                        replyMessage,
                        messageFiles,
                        jsonMessageDetails = messageDetailsJson
                    };

                    // ارسال به کلاینت‌های SignalR
                    await _webAppHubContext.Clients.All.SendAsync("ReceiveMessage", payload2);

                    // فراخوانی رویداد
                    OnReceiveMessage?.Invoke(payload2);


                }
                catch (System.Text.Json.JsonException ex)
                {
                    _logger.LogError($"خطا در تبدیل JSON: {ex.Message}");
                }
                catch (Exception ex)
                {
                    _logger.LogError($"خطای عمومی: {ex.Message}");
                }

            });

            _hubConnection.On<object>("ReceiveEditedMessage", async (payload) =>
            {
                _logger.LogDebug("API Hub: ReceiveEditedMessage event triggered.");
                // await _webAppHubContext.Clients.All.SendAsync("ReceiveEditedMessage", payload);

                try
                {
                    // تنظیمات برای نگاشت نام‌های CamelCase به PascalCase
                    var options = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase // JSON با حروف کوچک
                    };

                    // تبدیل payload به JSON string
                    string jsonString = System.Text.Json.JsonSerializer.Serialize(payload, options);

                    // دسريالايز کردن به MessageDto با تنظیمات CamelCase
                    MessageDto messageDto = System.Text.Json.JsonSerializer.Deserialize<MessageDto>(jsonString, options);

                    // پردازش replyMessage
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

                    // پردازش messageFiles
                    object messageFiles = null;
                    if (messageDto.MessageFiles != null && messageDto.MessageFiles.Any())
                    {
                        messageFiles = messageDto.MessageFiles.Select(mf => new
                        {
                            FileName = mf.FileName,
                            FileThumbPath = mf.FileThumbPath,
                            OriginalFileName = mf.OriginalFileName,
                            MessageFileId = mf.MessageFileId
                        }).ToList();
                    }

                    //ایجاد ابجکت جی سان
                    var messageDetailsJson = CreateJsonMessageDetails(messageDto);

                    var chatType = messageDto.MessageType == 0 ? ConstChat.ClassGroupType : ConstChat.ChannelGroupType;

                    // ساخت payload2 برای ارسال
                    var payload2 = new
                    {
                        senderUserId = messageDto.SenderUserId,
                        senderUserName = messageDto.SenderUser?.NameFamily,
                        messageText = messageDto.MessageText?.MessageTxt ?? "",
                        groupId = messageDto.ClassGroupId,
                        groupType = chatType,
                        messageDateTime = messageDto.MessageDateTime.ToString("HH:mm"),
                        profilePicName = messageDto.SenderUser?.ProfilePicName,
                        messageId = messageDto.MessageId,
                        replyToMessageId = messageDto.ReplyMessageId,
                        replyMessage,
                        messageFiles,
                        jsonMessageDetails = messageDetailsJson
                    };

                    // ارسال به کلاینت‌های SignalR
                    await _webAppHubContext.Clients.All.SendAsync("ReceiveEditedMessage", payload2);

                    // فراخوانی رویداد
                    OnReceiveMessage?.Invoke(payload2);


                }
                catch (System.Text.Json.JsonException ex)
                {
                    _logger.LogError($"خطا در تبدیل JSON: {ex.Message}");
                }
                catch (Exception ex)
                {
                    _logger.LogError($"خطای عمومی: {ex.Message}");
                }


                OnReceiveEditedMessage?.Invoke(payload);
            });

            _hubConnection.On<long, bool>("UserDeleteMessage", async (messageId, isHidden) =>
            {
                await _webAppHubContext.Clients.All.SendAsync("UserDeleteMessage", messageId, isHidden);
            });

            _hubConnection.On<long, string, int>("UserTyping", async (userId, userName, groupId) =>
            {
                await _webAppHubContext.Clients.All.SendAsync("UserTyping", userId, userName, groupId);
            });

            //اطلاع نتیجه به کاربر ضبط کننده صدا
            _hubConnection.On<string, bool, long, double, string, string>("ReceiveVoiceMessageResult", async (userId, success, fileId, duration, durationFormated, recordingId) =>
            {
                await _webAppHubContext.Clients.User(userId).SendAsync("ReceiveVoiceMessageResult", success, fileId, duration, durationFormated, recordingId);
            });

            // رویداد دریافت تعداد پیام خوانده نشده در چت
            // زمانی که یک پیام جدید در چت ارسال شد تعداد پیام خوانده نشده نیز ارسال میشود و در اینجا دریافت و پردازش میشود
            // چون برای هر کاربر ارسال میشود، در اینجا ایدی را در ورودی میگیریم به کاربر مورد نظر اطلاع رسانی میکنیم
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
            await _hubConnection.InvokeCoreAsync(methodName, args);
        }

        #endregion

        public Task SendMessageAsync(SendMessageRequestDto request) => InvokeHubMethodAsync("SendMessage", request);

        public Task EditMessageAsync(EditMessageRequestDto request) => InvokeHubMethodAsync("EditMessage", request);



        //private async Task InvokeHubMethodAsync(string methodName, params object[] args)
        //{
        //    if (!IsConnected) throw new InvalidOperationException("Not connected to SignalR hub.");
        //    try
        //    {
        //        await _hubConnection.InvokeCoreAsync(methodName, args);
        //    }
        //    catch (Exception ex)
        //    {
        //        _logger.LogError(ex, "Error invoking hub method {MethodName}", methodName);
        //        throw;
        //    }
        //}




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
