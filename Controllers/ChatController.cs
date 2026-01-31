using Messenger.DTOs;
using Messenger.Tools;
using Messenger.WebApp.Models;
using Messenger.WebApp.ServiceHelper;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Messenger.WebApp.ServiceHelper.RequestDTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using System.Net.Http;
using System.Security.Claims;
using System.Text.Json;

namespace Messenger.WebApp.Controllers
{
    [Authorize] // امنیت این کنترلر مهم است
    [Route("api/[controller]")] // مسیر پایه برای اکشن های این کنترلر
    [ApiController]
    public class ChatController : ControllerBase
    {
        private readonly HttpClient _httpClient;
        private readonly IMessageServiceClient _messageServiceClient;
        private readonly IFileManagementServiceClient _fileService;
        private readonly IRealtimeHubBridgeService _hubBridgeService; // برای متد GetUsersWithStatus
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly ILogger<ChatController> _logger;
        private readonly string _baseUrl;
        public ChatController(IRealtimeHubBridgeService hubBridgeService,
            ILogger<ChatController> logger,
            IMessageServiceClient messageServiceClient,
            IHttpContextAccessor httpContextAccessor,
            IFileManagementServiceClient fileManagementServiceClient, IOptions<ApiSettings> apiSettings,
            HttpClient httpClient)
        {
            _hubBridgeService = hubBridgeService;
            _logger = logger;
            _messageServiceClient = messageServiceClient;
            _httpContextAccessor = httpContextAccessor;
            _fileService = fileManagementServiceClient;
            _httpClient = httpClient;
            _baseUrl = apiSettings.Value.BaseUrl;
        }


        public class DownloadFileRequest
        {
            public long FileId { get; set; }
        }

        [HttpGet("downloadFileById")]
        public async Task<IActionResult> DownloadFileById([FromQuery] long fileId)
        {
            if (fileId <= 0)
                return BadRequest("Invalid file ID.");

            try
            {
                // دریافت توکن از کوکی یا هر روش دلخواه
                var token = Request.Cookies["AuthToken"];
                if (string.IsNullOrEmpty(token))
                    return Unauthorized("Token not found.");

                // ساخت درخواست HTTP به سرویس بیرونی
                using var requestMessage = new HttpRequestMessage(
                    HttpMethod.Get,
                    $"{_baseUrl}/api/filemanagement/download?messageFileId={fileId}"
                );

                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                // استفاده از ResponseHeadersRead برای استریم مستقیم
                using var response = await _httpClient.SendAsync(
                    requestMessage,
                    HttpCompletionOption.ResponseHeadersRead
                );

                if (!response.IsSuccessStatusCode)
                    return StatusCode((int)response.StatusCode, "File not found or download failed.");

                var stream = await response.Content.ReadAsStreamAsync();

                var contentDisposition = response.Content.Headers.ContentDisposition?.FileNameStar
                                         ?? response.Content.Headers.ContentDisposition?.FileName
                                         ?? $"file-{fileId}";

                var mimeType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";

                // enableRangeProcessing=true باعث می‌شود مرورگر بتواند resume کند
                return File(stream, mimeType, contentDisposition, enableRangeProcessing: true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error downloading file with ID {FileId}", fileId);
                return StatusCode(500, "Internal server error while downloading file.");
            }
        }



        [HttpPost("downloadBlobFileById")]
        public async Task<IActionResult> DownloadFileById([FromBody] DownloadFileRequest request)
        {
            if (request.FileId <= 0) return BadRequest("Request cannot be null.");

            try
            {
                var fileData = await _fileService.GetFileDataAsync(request.FileId);
                if (fileData == null)
                    return NotFound("File not found.");

                return File(fileData.Content, fileData.ContentType, fileData.FileName);
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "Error in DeleteMessage action.");
                return StatusCode(500, "Internal server error deleting message.");
            }
        }


        [HttpPost("deleteMessage")]
        public async Task<IActionResult> DeleteMessage([FromBody] DeleteMessageRequestDto request)
        {
            if (request == null) return BadRequest("Request cannot be null.");
            // TODO: Add validation
            try
            {
                //TODO: باید ایدی کانال یا گروه و نوع ان ارسال بشه تا در همان چت این پیام حذف بشه
                await _messageServiceClient.DeleteMessageAsync(request);
                return Ok();
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "Error in DeleteMessage action.");
                return StatusCode(500, "Internal server error deleting message.");
            }
        }


        [HttpGet("usersWithStatus")]
        public async Task<IActionResult> GetUsersWithStatus([FromQuery] string groupId, [FromQuery] string groupType)
        {
            if (string.IsNullOrEmpty(groupId) || string.IsNullOrEmpty(groupType))
                return BadRequest("GroupId and GroupType are required.");

            try
            {
                var users = await _hubBridgeService.GetUsersWithStatusAsync(groupId, groupType);
                return Ok(users);
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "Error in GetUsersWithStatus action.");
                return StatusCode(500, "Internal server error getting users with status.");
            }
        }


        [HttpPost("announce")]
        public async Task<IActionResult> AnnouncePresence()
        {
            try
            {
                var token = _httpContextAccessor.HttpContext?.Request.Cookies["AuthToken"];

                var userId = GetCurrentUserId();
                if (userId <= 0)
                {
                    return BadRequest("Request cannot be null.");
                }

                // فراخوانی متد انلاین شدن کاربر
                await _hubBridgeService.AnnounceUserPresenceAsync(userId);

                return Ok(new { message = "User presence successfully announced." });
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "Error during user presence announcement.");
                return StatusCode(500, "Failed to announce user presence.");
            }
        }

        private long GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim != null && long.TryParse(userIdClaim.Value, out long userId))
            {
                return userId;
            }
            // This should not happen if [Authorize] is working correctly and token is valid
            return 0;
        }
    }
}
