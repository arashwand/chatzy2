using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.AspNetCore.SignalR.Client;

namespace Messenger.WebApp.ServiceHelper
{
    public class HubConnectionMonitor : BackgroundService
    {
        private readonly ILogger<HubConnectionMonitor> _logger;
        private readonly IRealtimeHubBridgeService _hubBridge; // از اینترفیس استفاده می‌کنیم

        public HubConnectionMonitor(ILogger<HubConnectionMonitor> logger, IRealtimeHubBridgeService hubBridge)
        {
            _logger = logger;
            _hubBridge = hubBridge;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            // منتظر می‌مانیم تا برنامه کاملاً بالا بیاید
            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            _logger.LogInformation("Hub Connection Monitor is starting.");

            while (!stoppingToken.IsCancellationRequested)
            {
                // اگر اتصال برقرار نیست، تلاش برای اتصال مجدد
                if (!_hubBridge.IsConnected)
                {
                    _logger.LogWarning("Hub is disconnected. Monitor is attempting to reconnect...");
                    // اینجا باید متد اتصال از HubConnectionManager را فراخوانی کنیم
                    // برای این کار، باید اینترفیس را کمی تغییر دهیم
                    if (_hubBridge is HubConnectionManager manager)
                    {
                        await manager.ConnectWithRetryAsync(stoppingToken);
                    }
                }
                else
                {
                    _logger.LogInformation("Hub connection is active. Checking again in 1 minute.");
                }

                // هر یک دقیقه وضعیت را بررسی کن
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }

            _logger.LogInformation("Hub Connection Monitor is stopping.");
        }
    }
}
