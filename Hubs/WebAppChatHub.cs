using Messenger.DTOs;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Messenger.WebApp.Hubs
{
    [Authorize]
    public class WebAppChatHub : Hub
    {
        private readonly IRealtimeHubBridgeService _hubBridgeService;
        private readonly ILogger<WebAppChatHub> _logger;

        public WebAppChatHub(ILogger<WebAppChatHub> logger,
            IRealtimeHubBridgeService hubBridgeService)
        {
            _logger = logger;
            _hubBridgeService = hubBridgeService;
        }

        // متدهای جدید که مستقیماً از کلاینت (chatHub.js) فراخوانی می شوند
        // و جایگزین اکشن های کنترلر می شوند.

        public async Task SendTypingSignal(int groupId, string groupType)
        {
            var userId = long.Parse(Context.UserIdentifier);
            if (userId <= 0)
            {
                return;
            }
            // دیگر نیازی به try-catch یا اعتبارسنجی نیست، چون اینها در سرویس bridge انجام می شود.
            await _hubBridgeService.SendTypingSignalAsync(userId, groupId, groupType);
        }

        public async Task SendStopTypingSignal(int groupId, string groupType)
        {

            // شناسه کاربر فعلی را از Context هاب دریافت کنید
            var userId = long.Parse(Context.UserIdentifier);
            if (userId <= 0)
            {
                return;
            }
            await _hubBridgeService.SendStopTypingSignalAsync(userId, groupId, groupType);
        }

        public async Task MarkMessageAsRead(int groupId, string groupType, long messageId)
        {
            var userId = long.Parse(Context.UserIdentifier);
            if (userId <= 0)
            {
                return;
            }
            await _hubBridgeService.MarkMessageAsReadAsync(userId, groupId, groupType, messageId);
        }

        public async Task MarkAllMessagesAsRead(int groupId, string groupType)
        {
            var userId = long.Parse(Context.UserIdentifier);
            if (userId <= 0)
            {
                return;
            }
            await _hubBridgeService.MarkAllMessagesAsReadAsync(userId, groupId, groupType);
        }

        public override async Task OnConnectedAsync()
        {
            // دیگر نیازی به فراخوانی ConnectAsync نیست!
            _logger.LogInformation($"Client connected to WebAppChatHub: {Context.ConnectionId}.");
            await base.OnConnectedAsync();
        }

        public async Task SendHeartbeat()
        {
            var userId = long.Parse(Context.UserIdentifier);
            if (userId <= 0)
            {
                return;
            }
            if (!_hubBridgeService.IsConnected) // اضافه کردن این بررسی
            {
                _logger.LogWarning($"Heartbeat not sent. Hub bridge service is not connected for user {userId}.");
                // می‌توانید اینجا یک پیام خطا به کلاینت بفرستید یا فقط لاگ کنید
                return;
            }
            await _hubBridgeService.SendHeartbeatAsync(userId);

        }


        public async Task RequestUnreadCounts()
        {
            var userId = long.Parse(Context.UserIdentifier);
            if (userId <= 0)
            {
                return;
            }
            if (!_hubBridgeService.IsConnected) // اضافه کردن این بررسی
            {
                _logger.LogWarning($"Heartbeat not sent. Hub bridge service is not connected for user {userId}.");
                // می‌توانید اینجا یک پیام خطا به کلاینت بفرستید یا فقط لاگ کنید
                return;
            }
            await _hubBridgeService.RequestUnreadCounts(userId);

        }


        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            _logger.LogWarning(exception, $"Client disconnected: {Context.ConnectionId}");

            // شناسه کاربر را از Context استخراج کنید
            var userId = long.Parse(Context.UserIdentifier);

            // به سرویس Bridge اعلام کن که این کاربر آفلاین شده است
            await _hubBridgeService.AnnounceUserDepartureAsync(userId);

            await base.OnDisconnectedAsync(exception);
        }

        public async Task SendMessage(SendMessageRequestDto request)
        {
            // شناسه کاربر را از توکن خودش بخوانید تا امنیت حفظ شود
            var userId = long.Parse(Context.UserIdentifier);
            request.UserId = userId; // UserId را در آبجکت درخواست تنظیم کنید

            // درخواست را به سرویس Bridge پاس دهید تا به هاب اصلی API ارسال شود
            await _hubBridgeService.SendMessageAsync(request);
        }

        public async Task EditMessage(EditMessageRequestDto request)
        {
            // شناسه کاربر را از توکن خودش بخوانید تا امنیت حفظ شود
            var userId = long.Parse(Context.UserIdentifier);
            request.UserId = userId; // UserId را در آبجکت درخواست تنظیم کنید

            // درخواست را به سرویس Bridge پاس دهید تا به هاب اصلی API ارسال شود
            await _hubBridgeService.EditMessageAsync(request);
        }

        public async Task JoinGroup(string groupId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, groupId);
            _logger.LogInformation($"Client {Context.ConnectionId} (User: {Context.UserIdentifier}) JOINED group {groupId}");
        }

        public async Task LeaveGroup(string groupId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupId);
            _logger.LogInformation($"Client {Context.ConnectionId} (User: {Context.UserIdentifier}) LEFT group {groupId}");
        }
    }
}