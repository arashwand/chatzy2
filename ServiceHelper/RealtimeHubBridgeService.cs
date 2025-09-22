using Messenger.DTOs;
using Messenger.WebApp.Hubs;
using Messenger.WebApp.Models;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Messenger.WebApp.ServiceHelper
{
    // این سرویس باید به صورت Singleton ثبت شود
    public class RealtimeHubBridgeService : IRealtimeHubBridgeService, IHostedService, IAsyncDisposable
    {
        private HubConnection _hubConnection;
        private readonly ILogger<RealtimeHubBridgeService> _logger;
        private readonly string _hubUrl;
        private readonly IHttpClientFactory _httpClientFactory;
        private string _accessToken; // برای نگهداری توکن
        private readonly IHubContext<WebAppChatHub> _webAppHubContext;
        private readonly IConfiguration _configuration; // برای خواندن توکن سرویس
        private readonly SemaphoreSlim _connectionLock = new SemaphoreSlim(1, 1);

        public bool IsConnected => _hubConnection?.State == HubConnectionState.Connected;

        // Events that WebApp components can subscribe to
        public event Func<object, Task> OnReceiveMessage;
        public event Func<object, Task> OnReceiveEditedMessage;
        // ... other events can be defined here if needed by other backend services in WebApp
       // private readonly string _accessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjEiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJNYW5hZ2VyIiwianRpIjoiMzI0OTkzYjgtNGRkZC00MjNjLWI2NDctNjA3NjM2MGY0MTY2IiwiUG9ydGFsUm9sZUlkIjoiMSIsIk5hbWVGYW1pbHkiOiLYqtmI2LPYudmHINiv2YfZhtiv2YciLCJTdHVkZW50SWQiOiItMSIsIlRlYWNoZXJJZCI6Ii0xIiwiTWVudG9ySWQiOiItMSIsIlBlcnNvbmVsSWQiOiItMSIsIkJyYW5jaElkIjoiMCIsImV4cCI6MTc1MTU1NzA2NywiaXNzIjoiaHR0cHM6Ly9zc28uaXJhbi1ldXJvcGUubmV0LyIsImF1ZCI6Imh0dHBzOi8vbG9jYWxob3N0OjcyNzAvIn0.Sjz52tWgHld-vaZD2cdcZPrdwjWnuHBuVeVQKiPRYwg";
        public RealtimeHubBridgeService(ILogger<RealtimeHubBridgeService> logger,
            IOptions<ApiSettings> apiSettings,
            IHubContext<WebAppChatHub> webAppHubContext,
            IConfiguration configuration,IHttpClientFactory httpClientFactory)
        {
            _logger = logger;
            _hubUrl = $"{apiSettings.Value.BaseUrl.TrimEnd('/')}/chathub";
            _httpClientFactory = httpClientFactory;
            _webAppHubContext = webAppHubContext;
            _logger.LogInformation("RealtimeHubBridgeService initialized. Hub URL: {HubUrl}", _hubUrl);
            _configuration = configuration;
        }

        #region Connect new way


        public async Task StartAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("RealtimeHubBridgeService is starting, attempting to authenticate with SSO...");

            // ۱. درخواست توکن از SSO
            if (!await RequestSsoTokenAsync())
            {
                _logger.LogCritical("Could not obtain token from SSO. Bridge service will not connect.");
                return;
            }


            // ۲. اتصال را با توکن سرویس بسازید
            _hubConnection = new HubConnectionBuilder()
                .WithUrl(_hubUrl, options =>
                {
                    // از توکن سرویس برای احراز هویت استفاده کنید
                    options.AccessTokenProvider = () => Task.FromResult(_accessToken);
                })
                .WithAutomaticReconnect()
                .Build();

            // ۳. رویدادها را ثبت کنید
            RegisterHubEventHandlers(); // این متد خصوصی شامل تمام _hubConnection.On(...) های شماست

            // ۴. تلاش برای اتصال
            try
            {
                await _hubConnection.StartAsync(cancellationToken);
                _logger.LogInformation("Bridge service connected to API Hub successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to connect bridge service to API hub.");
            }
        }


        public async Task StopAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("RealtimeHubBridgeService is stopping.");
            if (_hubConnection != null)
            {
                await _hubConnection.DisposeAsync(); // این متد اتصال را قطع و منابع را آزاد می‌کند
            }
        }

        // برای اطمینان از آزادسازی منابع، می‌توانید IAsyncDisposable را هم پیاده‌سازی کنید
        public async ValueTask DisposeAsync()
        {
            if (_hubConnection != null)
            {
                await _hubConnection.DisposeAsync();
            }
        }
        #endregion

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

        private void RegisterHubEventHandlers()
        {
            _hubConnection.On<object>("ReceiveMessage", async (payload) =>
            {
                _logger.LogDebug("API Hub: ReceiveMessage event triggered.");

                #region make payloadUi
                // var MessageDto =
               

                #region update redis Last Message
                // جهت نگهداری اخرین پیام ارسال شده
                // var message = _chatRepository.SaveMessage(request);
                //var lastMessageModelForRedis = new ChatMessageDto
                //{
                //    MessageId = messageDto.MessageId,
                //    Text = messageDto.MessageText?.MessageTxt,
                //    SenderId = messageDto.SenderUserId,
                //    SenderName = messageDto.SenderUser.NameFamily,
                //    SentAt = messageDto.MessageDateTime
                //};

                //// بروزرسانی اخرین پیام ارسالی در redis
                //await _redisLastMessage.SetLastMessageAsync(groupType, groupId.ToString(), lastMessageModelForRedis);

                #endregion

                try
                {
                    // تنظیمات برای نگاشت نام‌های CamelCase به PascalCase
                    var options = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase // JSON با حروف کوچک
                    };

                    // تبدیل payload به JSON string
                    string jsonString = JsonSerializer.Serialize(payload, options);

                    // دسريالايز کردن به MessageDto با تنظیمات CamelCase
                    MessageDto messageDto = JsonSerializer.Deserialize<MessageDto>(jsonString, options);

                    // پردازش replyMessage
                    object replyMessage = null;
                    if (messageDto.ReplyMessageId != null && messageDto.ReplyMessage != null)
                    {
                        replyMessage = new
                        {
                            replyToMessageId = messageDto.ReplyMessageId,
                            senderUserName = messageDto.ReplyMessage.SenderUser?.NameFamily,
                            messageText = messageDto.ReplyMessage.MessageText?.MessageTxt
                        };
                    }

                    // پردازش messageFiles
                    object messageFiles = null;
                    if (messageDto.MessageFiles != null && messageDto.MessageFiles.Any())
                    {
                        messageFiles = messageDto.MessageFiles.Select(mf => new
                        {
                            FileName = mf.FileName,
                            FileThumbPath = mf.FileThumbPath
                        }).ToList();
                    }

                    // ساخت payload2 برای ارسال
                    var payload2 = new
                    {
                        senderUserId = messageDto.SenderUserId,
                        senderUserName = messageDto.SenderUser?.NameFamily,
                        messageText = messageDto.MessageText?.MessageTxt,
                        groupId = messageDto.ClassGroupId,
                        messageDateTime = messageDto.MessageDateTime.ToString("HH:mm"),
                        profilePicName = messageDto.SenderUser?.ProfilePicName,
                        messageId = messageDto.MessageId,
                        replyToMessageId = messageDto.ReplyMessageId,
                        replyMessage,
                        messageFiles
                    };

                    // ارسال به کلاینت‌های SignalR
                    await _webAppHubContext.Clients.All.SendAsync("ReceiveMessage", payload2);

                    // فراخوانی رویداد
                    OnReceiveMessage?.Invoke(payload2);

                    #endregion
                }
                catch (JsonException ex)
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
                await _webAppHubContext.Clients.All.SendAsync("ReceiveEditedMessage", payload);
                OnReceiveEditedMessage?.Invoke(payload);
            });

            _hubConnection.On<long, string, int>("UserTyping", async (userId, userName, groupId) =>
            {
                await _webAppHubContext.Clients.All.SendAsync("UserTyping", userId, userName, groupId);
            });

            // این رویداد فقط برای تایید ارسال موفق پیام به خود فرستنده است
            _hubConnection.On<MessageDto>("MessageSentSuccessfully", async (savedMessage) =>
            {
                _logger.LogInformation($"Bridge received 'MessageSentSuccessfully' for client message {savedMessage.MessageId}");

                // پیدا کردن شناسه کاربری که پیام را فرستاده
                var userId = savedMessage.SenderUserId.ToString();

                // پیام تایید را فقط به همان کاربر خاص در WebAppChatHub ارسال کنید
                await _webAppHubContext.Clients.User(userId)
                    .SendAsync("MessageSentSuccessfully", savedMessage);
            });

            // ... Register all other event handlers from the original ChatService here ...
            // (UserStoppedTyping, UserStatusChanged, MessageReadByRecipient, etc.)


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

        public Task SendMessageAsync(SendMessageRequestDto request)
        {
            _logger.LogInformation($"Bridge forwarding SendMessage request for user {request.UserId} in group {request.GroupId}");
            // "SendMessage" نام متد در هاب اصلی API است
            return InvokeHubMethodAsync("SendMessage", request);
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

        private async Task InvokeHubMethodAsync(string methodName, params object[] args)
        {
            if (!IsConnected) throw new InvalidOperationException("Not connected to SignalR hub.");
            try
            {
                await _hubConnection.InvokeCoreAsync(methodName, args);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error invoking hub method {MethodName}", methodName);
                throw;
            }
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

        public Task SendTypingSignalAsync(long userId,int groupId, string groupType) => InvokeHubMethodAsync("Typing",userId, groupId, groupType);

        public Task SendStopTypingSignalAsync(long userId,int groupId, string groupType) => InvokeHubMethodAsync("StopTyping",userId, groupId, groupType);

        public Task MarkMessageAsReadAsync(long userId, int groupId, string groupType, long messageId) => InvokeHubMethodAsync("MarkMessageAsRead",userId, groupId, groupType, messageId);

        public Task<List<object>> GetUsersWithStatusAsync(string groupId, string groupType) => InvokeHubMethodWithResultAsync<List<object>>("GetUsersWithStatus", groupId, groupType);

        // متد عمومی جدید که از کنترلر فراخوانی می‌شود
        public  Task AnnounceUserPresenceAsync(long userId)
        {
            return InvokeHubMethodAsync("AnnouncePresence", userId);

        }

        public Task AnnounceUserDepartureAsync(long userId)
        {
            // "AnnounceDeparture" نام متد متناظر در هاب API است
            return InvokeHubMethodAsync("AnnounceDeparture", userId);
        }


        //درخواست توکن از  sso برای لاگین به هاب اصلی
        private async Task<bool> RequestSsoTokenAsync()
        {
            try
            {
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
                    return false;
                }

                //var responseContentString = await response.Content.ReadAsStringAsync();
                //_logger.LogError("Response content: {Content}", responseContentString);


                var responseContent = await response.Content.ReadFromJsonAsync<SsoTokenResponse>();
                _accessToken = responseContent?.access_token;


                #region debug
                //TODO : این قسمت بعد از دیباگ حذف شود
                if (!string.IsNullOrEmpty(_accessToken))
                {
                    _logger.LogInformation("Successfully obtained access token from SSO.");
                    _logger.LogWarning("DEBUG: SSO Access Token: {AccessToken}", _accessToken); // Temporary: Log the token for debugging

                    // Attempt to decode and log claims (basic decoding, no validation here)
                    try
                    {
                        var handler = new JwtSecurityTokenHandler();
                        if (handler.CanReadToken(_accessToken))
                        {
                            var jsonToken = handler.ReadToken(_accessToken) as JwtSecurityToken;
                            if (jsonToken != null)
                            {
                                _logger.LogWarning("DEBUG: SSO Token Claims:");
                                foreach (var claim in jsonToken.Claims)
                                {
                                    _logger.LogWarning("DEBUG: Claim Type: {Type}, Claim Value: {Value}", claim.Type, claim.Value);
                                }
                            }
                        }
                    }
                    catch (Exception exDec)
                    {
                        _logger.LogError(exDec, "DEBUG: Failed to decode or read claims from SSO token.");
                    }
                }
                else
                {
                    _logger.LogError("Failed to obtain access token from SSO. Token is null or empty.");
                }

                #endregion


                _logger.LogInformation("Successfully obtained access token from SSO.");
                return !string.IsNullOrEmpty(_accessToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Exception while requesting SSO token.");
                return false;
            }
        }
    }
}