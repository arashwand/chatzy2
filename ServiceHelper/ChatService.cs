using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Messenger.WebApp.Models; // For JwtSettings or similar if needed for Hub URL
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.SignalR;
using Messenger.WebApp.Hubs;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text;
using Messenger.WebApp.ServiceHelper.RequestDTOs; // If using IOptions for settings
using Messenger.Tools; // Added for ConstChat

namespace Messenger.WebApp.ServiceHelper
{
    public class ChatService : IChatService
    {
        private HubConnection _hubConnection;
        private readonly ILogger<ChatService> _logger;
        private readonly string _hubUrl;
       // private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IHubContext<WebAppChatHub> _webAppHubContext;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IOptions<ApiSettings> _apiSettings;
        private readonly IMessageServiceClient _messageServiceClient; // Added
        private readonly SemaphoreSlim _connectionLock = new SemaphoreSlim(1, 1);
        public bool IsConnected => _hubConnection?.State == HubConnectionState.Connected;

        // Events
        public event Func<object, Task> OnReceiveMessage;
        public event Func<object, Task> OnReceiveEditedMessage;
        public event Func<long, string, int, Task> OnUserTyping;
        public event Func<long, int, Task> OnUserStoppedTyping;
        public event Func<long, bool, int, string, Task> OnUserStatusChanged;
        public event Func<long, long, int, string, string, Task> OnMessageReadByRecipient;
        public event Func<long, int, string, Task> OnMessageSuccessfullyMarkedAsRead;
        public event Func<long, bool, Task> OnMessageDeleted;

        public ChatService(ILogger<ChatService> logger,
                           IOptions<ApiSettings> apiSettings,
                           //IHttpContextAccessor httpContextAccessor,
                           IHubContext<WebAppChatHub> webAppHubContext,
                           IHttpClientFactory httpClientFactory,
                           IMessageServiceClient messageServiceClient) // Added
        {
            _logger = logger;
            _hubUrl = $"{apiSettings.Value.BaseUrl.TrimEnd('/')}/chathub";
           // _httpContextAccessor = httpContextAccessor;
            _webAppHubContext = webAppHubContext;
            _logger.LogInformation("ChatService initialized. Hub URL: {HubUrl}", _hubUrl);
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiSettings;
            _messageServiceClient = messageServiceClient; // Added
        }

        public async Task ConnectAsync(string token)
        {
            if (IsConnected)
            {
                _logger.LogInformation("ConnectAsync called but already connected.");
                return;
            }

            if (string.IsNullOrEmpty(token))
            {
                _logger.LogWarning("SignalR connection token is missing. Cannot connect.");
                return;
            }

            // var token = _httpContextAccessor.HttpContext?.Request.Cookies["AuthToken"];

            if (string.IsNullOrEmpty(token))
            {
                _logger.LogWarning("SignalR connection token is missing. Cannot connect.");
                // Optionally, you could throw an exception or set a status indicating failed connection due to missing token.
                return;
            }

            _logger.LogInformation("Attempting to connect to SignalR hub at {HubUrl}", _hubUrl);
            _hubConnection = new HubConnectionBuilder()
                .WithUrl(_hubUrl, options =>
                {
                    options.AccessTokenProvider = () => Task.FromResult(token);
                })
                .WithAutomaticReconnect()
                .Build();

            RegisterHubEventHandlers();

            try
            {
                await _hubConnection.StartAsync();
                _logger.LogInformation("Successfully connected to SignalR hub. Connection ID: {ConnectionId}", _hubConnection.ConnectionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error connecting to SignalR hub at {HubUrl}", _hubUrl);
                // Optionally, rethrow or handle specific exceptions
            }
        }

        private void RegisterHubEventHandlers()
        {
            // بررسی اتباط با هاب داخلی نرم افزار کلاینت
            if (_hubConnection == null) return;

            _hubConnection.On<object>("ReceiveMessage", async (payload) =>
            {
                _logger.LogDebug("API Hub: ReceiveMessage event triggered with payload: {@Payload}", payload);
                await _webAppHubContext.Clients.All.SendAsync("ReceiveMessage", payload);
                if (OnReceiveMessage != null) await OnReceiveMessage.Invoke(payload); // Keep for internal WebApp backend logic if any
            });

            _hubConnection.On<object>("ReceiveEditedMessage", async (payload) =>
            {
                _logger.LogDebug("API Hub: ReceiveEditedMessage event triggered with payload: {@Payload}", payload);
                await _webAppHubContext.Clients.All.SendAsync("ReceiveEditedMessage", payload);
                if (OnReceiveEditedMessage != null) await OnReceiveEditedMessage.Invoke(payload);
            });

            _hubConnection.On<long, string, int>("UserTyping", async (userId, userName, groupId) =>
            {
                _logger.LogDebug("API Hub: UserTyping event for UserId: {UserId}, GroupId: {GroupId}", userId, groupId);
                // It's better to target specific group if possible, or all clients of WebAppChatHub
                await _webAppHubContext.Clients.All.SendAsync("UserTyping", userId, userName, groupId);
                if (OnUserTyping != null) await OnUserTyping.Invoke(userId, userName, groupId);
            });

            _hubConnection.On<long, int>("UserStoppedTyping", async (userId, groupId) =>
            {
                _logger.LogDebug("API Hub: UserStoppedTyping event for UserId: {UserId}, GroupId: {GroupId}", userId, groupId);
                await _webAppHubContext.Clients.All.SendAsync("UserStoppedTyping", userId, groupId);
                if (OnUserStoppedTyping != null) await OnUserStoppedTyping.Invoke(userId, groupId);
            });

            _hubConnection.On<long, bool, int, string>("UserStatusChanged", async (userId, isOnline, groupId, groupType) =>
            {
                _logger.LogDebug("API Hub: UserStatusChanged event for UserId: {UserId}, GroupId: {GroupId}", userId, groupId);
                await _webAppHubContext.Clients.All.SendAsync("UserStatusChanged", userId, isOnline, groupId, groupType);
                if (OnUserStatusChanged != null) await OnUserStatusChanged.Invoke(userId, isOnline, groupId, groupType);
            });

            _hubConnection.On<long, long, int, string, string>("MessageReadByRecipient", async (messageId, readerUserId, groupId, groupType, readerFullName) =>
            {
                _logger.LogDebug("API Hub: MessageReadByRecipient event for MessageId: {MessageId}", messageId);
                // This event is often targeted to the original sender.
                // We need a way to map API Hub's sender to a WebAppChatHub user/connection.
                // For now, sending to all, or ideally, if the payload contains original sender's ID, use Clients.User(senderId.ToString())
                // Assuming payload of ReceiveMessage contains senderUserId, and it's the one who should receive this.
                // This logic needs refinement based on how ChatHub (API) sends this.
                // If ChatHub (API) sends this only to the relevant sender, then ChatService (WebApp)
                // also needs to know which WebApp user (connection) corresponds to that API sender.
                // For simplicity now, forwarding to all. This might mean users get notifications not meant for them.
                // A better approach: if the original sender's UserID is known here, and that UserID is used as Group name in WebAppChatHub:
                // await _webAppHubContext.Clients.Group(senderUserId.ToString()).SendAsync("MessageReadByRecipient", messageId, readerUserId, groupId, groupType, readerFullName);
                await _webAppHubContext.Clients.All.SendAsync("MessageReadByRecipient", messageId, readerUserId, groupId, groupType, readerFullName);
                if (OnMessageReadByRecipient != null) await OnMessageReadByRecipient.Invoke(messageId, readerUserId, groupId, groupType, readerFullName);
            });

            _hubConnection.On<long, int, string>("MessageSuccessfullyMarkedAsRead", async (messageId, groupId, groupType) =>
            {
                _logger.LogDebug("API Hub: MessageSuccessfullyMarkedAsRead event for MessageId: {MessageId}", messageId);
                // This is a confirmation to the reader. The reader's connection made the request.
                // We need to send this back to the specific user/connection in WebAppChatHub that initiated the read.
                // This is tricky without more context mapping. Sending to all for now.
                // Ideally: await _webAppHubContext.Clients.Client(Context.ConnectionId_of_the_original_caller_in_WebAppChatHub).SendAsync(...)
                await _webAppHubContext.Clients.All.SendAsync("MessageSuccessfullyMarkedAsRead", messageId, groupId, groupType);
                if (OnMessageSuccessfullyMarkedAsRead != null) await OnMessageSuccessfullyMarkedAsRead.Invoke(messageId, groupId, groupType);
            });

            _hubConnection.On<long, bool>("UserDeleteMessage", async (messageId, success) =>
            {
                _logger.LogDebug("API Hub: UserDeleteMessage event for MessageId: {MessageId}", messageId);
                await _webAppHubContext.Clients.All.SendAsync("UserDeleteMessage", messageId, success);
                if (OnMessageDeleted != null) await OnMessageDeleted.Invoke(messageId, success);
            });

            _hubConnection.Closed += async (error) =>
            {
                _logger.LogError(error, "SignalR connection closed.");
                // Handle reconnection logic or notify UI
                await Task.CompletedTask;
            };

            _hubConnection.Reconnecting += async (error) =>
            {
                _logger.LogWarning(error, "SignalR connection reconnecting...");
                // Handle reconnection logic or notify UI
                await Task.CompletedTask;
            };

            _hubConnection.Reconnected += async (connectionId) =>
            {
                _logger.LogInformation("SignalR connection reconnected with new Connection ID: {ConnectionId}", connectionId);
                // Handle reconnected logic
                await Task.CompletedTask;
            };
        }

        public async Task DisconnectAsync()
        {
            if (!IsConnected)
            {
                _logger.LogInformation("DisconnectAsync called but not connected.");
                return;
            }
            _logger.LogInformation("Attempting to disconnect from SignalR hub.");
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

        private async Task EnsureConnectedAsync(string token)
        {
            if (IsConnected)
            {
                return;
            }

            if (string.IsNullOrEmpty(token))
            {
                _logger.LogWarning("SendMessageViaApiAsync: AuthToken is missing.");
                return;
            }

            // از قفل استفاده می‌کنیم تا اگر چند درخواست همزمان رسید،
            // فقط یکی از آنها برای اتصال اقدام کند.
            await _connectionLock.WaitAsync();
            try
            {
                // دوباره چک می‌کنیم چون ممکن است ترد دیگری در حین انتظار، اتصال را برقرار کرده باشد
                if (IsConnected)
                {
                    return;
                }
                await ConnectAsync(token);
            }
            finally
            {
                _connectionLock.Release();
            }
        }

       
        private async Task InvokeHubMethodAsync(string token, string methodName, params object[] args)
        {
            // این خط، اتصال را قبل از هر عملیاتی تضمین می‌کند
            await EnsureConnectedAsync(token);

            if (!IsConnected)
            {
                _logger.LogWarning("Attempted to invoke hub method {MethodName} but connection could not be established.", methodName);
                throw new InvalidOperationException("Not connected to SignalR hub.");
            }

            try
            {
                await _hubConnection.InvokeCoreAsync(methodName, args);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error invoking hub method {MethodName} with args: {@Args}", methodName, args);
                throw; // پرتاب مجدد خطا مهم است تا لایه‌های بالاتر متوجه مشکل شوند
            }
        }

        private async Task<T> InvokeHubMethodWithResultAsync<T>(string methodName, params object[] args)
        {
            await EnsureConnectedAsync();

            if (!IsConnected)
            {
                _logger.LogWarning("Attempted to invoke hub method {MethodName} for result but connection could not be established.", methodName);
                // throw new InvalidOperationException("Not connected to SignalR hub.");
                return default;
            }
            try
            {
                return await _hubConnection.InvokeCoreAsync<T>(methodName, args);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error invoking hub method {MethodName} with args {@Args} for result.", methodName, args);
                return default;
            }
        }


        public async Task<bool> SendMessageViaApiAsync(SendMessageRequestDto request,string token)
        {
            //var token = _httpContextAccessor.HttpContext?.Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token))
            {
                _logger.LogWarning("SendMessageViaApiAsync: AuthToken is missing.");
                return false;
            }

            try
            {
                var client = _httpClientFactory.CreateClient("api"); // استفاده از کلاینت نام‌گذاری شده بهتر است
                client.BaseAddress = new Uri(_apiSettings.Value.BaseUrl);
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var jsonContent = new StringContent(JsonSerializer.Serialize(request), Encoding.UTF8, "application/json");

                var response = await client.PostAsync("/api/messages", jsonContent); // Endpoint در لایه API

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogError("API call to send message failed. Status: {status}. Content: {content}", response.StatusCode, errorContent);
                }

                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Exception while sending message via API.");
                return false;
            }
        }

        public async Task SendMessageToGroupAsync(int groupId, string messageText, string groupType,
            long? replyToMessageId = null, List<long>? fileAttachementIds = null)
        {
            // No longer directly invokes API Hub. Uses MessageServiceClient instead.
            // The MessageServiceClient will make an HTTP call to the API.
            // The API's MessagesController will then handle saving and notifying the API's ChatHub.
            // This ChatService (WebApp) will receive the message via its SignalR connection to the API's ChatHub (event OnReceiveMessage).

            try
            {
                if (groupType == ConstChat.ClassGroupType)
                {
                    await _messageServiceClient.SendClassGroupMessageAsync(groupId, messageText, fileAttachementIds, replyToMessageId);
                }
                else if (groupType == ConstChat.ChannelGroupType)
                {
                    await _messageServiceClient.SendChannelMessageAsync(groupId, messageText, fileAttachementIds, replyToMessageId);
                }
                else if (groupType == ConstChat.PrivateType) // Assuming you might have a private chat
                {
                    // Note: SendPrivateMessageAsync in IMessageServiceClient takes receiverUserId, not groupId.
                    // This mapping would need to be handled if private chats are routed through here.
                    // For now, focusing on Group and Channel as per existing logic.
                    // await _messageServiceClient.SendPrivateMessageAsync(receiverUserId, messageText, fileAttachementIds, replyToMessageId);
                }
                else
                {
                    _logger.LogWarning($"SendMessageToGroupAsync called with unknown groupType: {groupType}");
                    throw new ArgumentException("Invalid group type provided.", nameof(groupType));
                }
                _logger.LogInformation($"SendMessageToGroupAsync: Message sending initiated via MessageServiceClient for GroupId {groupId}, Type {groupType}.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in SendMessageToGroupAsync using MessageServiceClient for GroupId {groupId}, Type {groupType}.");
                throw; // Re-throw to allow controller to handle
            }
        }

        public async Task EditMessageAsync(long messageId, string newText, int groupId, string groupType, List<long>? fileIds, List<long>? fileIdsToRemove)
        {
            // Similar to SendMessageToGroupAsync, this should use MessageServiceClient
            try
            {
                if (groupType == ConstChat.ClassGroupType)
                {
                    // Assuming IMessageServiceClient has an appropriate edit method.
                    // Based on IMessageServiceClient, it has EditClassGroupMessageAsync
                    await _messageServiceClient.EditClassGroupMessageAsync(messageId, newText, fileIds, fileIdsToRemove);
                }
                // Add else if for ChannelType if an edit method exists for channels in IMessageServiceClient
                // else if (groupType == ConstChat.ChannelGroupType)
                // {
                //    await _messageServiceClient.EditChannelMessageAsync(messageId, newText, fileIds, fileIdsToRemove); // Fictional method
                // }
                else
                {
                    _logger.LogWarning($"EditMessageAsync called with unsupported groupType: {groupType} for message {messageId}");
                    throw new ArgumentException("Editing is currently only supported for class groups or the group type is invalid.", nameof(groupType));
                }
                _logger.LogInformation($"EditMessageAsync: Message edit initiated via MessageServiceClient for MessageId {messageId}, GroupId {groupId}, Type {groupType}.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in EditMessageAsync using MessageServiceClient for MessageId {messageId}.");
                throw;
            }
        }

        public Task SendTypingSignalAsync(int groupId, string groupType)
        {
            return InvokeHubMethodAsync("Typing", groupId, groupType);
        }

        public Task SendStopTypingSignalAsync(int groupId, string groupType)
        {
            return InvokeHubMethodAsync("StopTyping", groupId, groupType);
        }

        public Task MarkMessageAsReadAsync(int groupId, string groupType, long messageId)
        {
            return InvokeHubMethodAsync("MarkMessageAsRead", groupId, groupType, messageId);
        }

        public async Task DeleteMessageAsync(int groupId, string groupType, long messageId)
        {
            // Changed to use MessageServiceClient
            // The groupId and groupType might be redundant here if MessageServiceClient.DeleteMessageAsync only needs messageId
            // and the API's MessagesController/MessageService handles permissions correctly.
            try
            {
                await _messageServiceClient.DeleteMessageAsync(messageId);
                _logger.LogInformation($"DeleteMessageAsync: Message deletion initiated via MessageServiceClient for MessageId {messageId}. GroupId {groupId}, Type {groupType} were provided but may not be used by the client.");
                // Note: The SignalR notification for "UserDeleteMessage" will now originate from the API side (MessagesController/ChatHub)
                // after successful deletion, not directly invoked here.
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error in DeleteMessageAsync using MessageServiceClient for MessageId {messageId}.");
                throw;
            }
        }

        public Task<List<object>> GetUsersWithStatusAsync(string groupId, string groupType)
        {
            return InvokeHubMethodWithResultAsync<List<object>>("GetUsersWithStatus", groupId, groupType);
        }
    }

    // Placeholder for API settings, assuming you'll have a configuration section for it
    // This should be in a Models folder or similar, e.g., Messenger.WebApp/Models/ApiSettings.cs
    // public class ApiSettings
    // {
    //    public string BaseUrl { get; set; }
    // }
}
