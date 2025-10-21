using Messenger.WebApp.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System.Security.Claims;
using System.Threading.Tasks;

namespace Messenger.WebApp.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class MessagesController : ControllerBase
    {
        private readonly IMessageService _messageService;
        private readonly ILogger<MessagesController> _logger;

        public MessagesController(IMessageService messageService, ILogger<MessagesController> logger)
        {
            _messageService = messageService;
            _logger = logger;
        }

        private long GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim != null && long.TryParse(userIdClaim.Value, out long userId))
            {
                return userId;
            }
            return 0; // در حالت عادی این اتفاق نباید بیفتد
        }

        [HttpPost("sync")]
        public async Task<ActionResult<SyncChatResult>> Sync([FromBody] SyncChatRequest request)
        {
            var userId = GetCurrentUserId();
            if (userId <= 0)
            {
                return Unauthorized("شناسه کاربری نامعتبر است.");
            }

            _logger.LogInformation("درخواست همگام‌سازی برای {GroupType}/{ChatId} برای کاربر {UserId} پردازش می‌شود",
                request.GroupType, request.ChatId, userId);

            var result = await _messageService.SyncChatHistoryAsync(request, userId);

            return Ok(result);
        }
    }
}
