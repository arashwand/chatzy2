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

        [HttpPost("UploadAudioChunk")]
        [RequestSizeLimit(1024 * 1024 * 1024)]
        public async Task<IActionResult> UploadAudioChunk([FromForm] IFormFile file, [FromForm] string recordingId, [FromForm] int chunkIndex, [FromForm] bool isLastChunk)
        {
            if (file == null || file.Length == 0)
                return BadRequest("File chunk is required.");

            // 1. Get the JWT token from the incoming request's cookies
            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token))
                return Unauthorized("Auth token not found.");

            // کانشکشن هاب کلاینت با هاب وبسرویس
            var connectionId = _hubBridgeService.ClientConnectionId;
            if (connectionId == null)
                return Unauthorized("connectinId not found!. client hub disconnected from api hub");

            try
            {
                // 2. Create the multipart form data content to forward
                using var multipartFormContent = new MultipartFormDataContent();

                // Add file stream
                using var fileStreamContent = new StreamContent(file.OpenReadStream());
                fileStreamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(file.ContentType);
                multipartFormContent.Add(fileStreamContent, name: "file", fileName: file.FileName);

                // Add other form data fields
                multipartFormContent.Add(new StringContent(recordingId), name: "recordingId");
                multipartFormContent.Add(new StringContent(chunkIndex.ToString()), name: "chunkIndex");
                multipartFormContent.Add(new StringContent(isLastChunk.ToString().ToLower()), name: "isLastChunk");

              //  multipartFormContent.Add(new StringContent(connectionId), name: "connectionId");

                // 3. Create the HTTP request to the external web service
                var url = $"{_baseUrl}/api/FileManagement/UploadAudioChunk"; // Corrected URL
                using var requestMessage = new HttpRequestMessage(HttpMethod.Post, url);
                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                requestMessage.Content = multipartFormContent;

                // 4. Forward the request and get the response
                using var response = await _httpClient.SendAsync(requestMessage);

                // 5. Return the response from the external service directly to the client
                var responseBody = await response.Content.ReadAsStringAsync();
                return new ContentResult
                {
                    Content = responseBody,
                    ContentType = response.Content.Headers.ContentType?.ToString(),
                    StatusCode = (int)response.StatusCode
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error forwarding audio chunk for recordingId {RecordingId}", recordingId);
                return StatusCode(500, "Internal server error while forwarding the audio chunk.");
            }
        }

        [HttpPost("UploadFileChunk")]
        [RequestSizeLimit(1024 * 1024 * 1024)] // 1 GB chunk limit, can be adjusted
        public async Task<IActionResult> UploadFileChunk(
            [FromForm] IFormFile file,
            [FromForm] string uploadId,
            [FromForm] int chunkIndex,
            [FromForm] int totalChunks,
            [FromForm] string originalFileName)
        {
            if (file == null || file.Length == 0)
                return BadRequest("File chunk is required.");

            if (string.IsNullOrEmpty(uploadId) || string.IsNullOrEmpty(originalFileName) || chunkIndex < 0 || totalChunks <= 0)
                return BadRequest("Upload ID, original file name, and valid chunk info are required.");

            // 1. Get the JWT token from the incoming request's cookies
            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token))
                return Unauthorized("Auth token not found.");

            try
            {
                // 2. Create the multipart form data content to forward
                using var multipartFormContent = new MultipartFormDataContent();

                // Add file stream
                using var fileStreamContent = new StreamContent(file.OpenReadStream());
                fileStreamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(file.ContentType);
                // The FileName here is just 'blob' from the client, 'originalFileName' is the important one sent separately.
                multipartFormContent.Add(fileStreamContent, name: "file", fileName: file.FileName);

                // Add other form data fields
                multipartFormContent.Add(new StringContent(uploadId), name: "uploadId");
                multipartFormContent.Add(new StringContent(chunkIndex.ToString()), name: "chunkIndex");
                multipartFormContent.Add(new StringContent(totalChunks.ToString()), name: "totalChunks");
                multipartFormContent.Add(new StringContent(originalFileName), name: "originalFileName");

                // 3. Create the HTTP request to the external web service
                var url = $"{_baseUrl}/api/FileManagement/UploadFileChunk";
                using var requestMessage = new HttpRequestMessage(HttpMethod.Post, url);
                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                requestMessage.Content = multipartFormContent;

                // 4. Forward the request and get the response
                using var response = await _httpClient.SendAsync(requestMessage);

                // 5. Return the response from the external service directly to the client
                var responseBody = await response.Content.ReadAsStringAsync();

                return new ContentResult
                {
                    Content = responseBody,
                    ContentType = response.Content.Headers.ContentType?.ToString(),
                    StatusCode = (int)response.StatusCode
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error forwarding file chunk for uploadId {UploadId}", uploadId);
                return StatusCode(500, "Internal server error while forwarding the file chunk.");
            }
        }

        [HttpGet("getGroupSharedFiles")]
        public async Task<IActionResult> GetGroupSharedFiles([FromQuery] int chatId, [FromQuery] string groupType)
        {
            if (chatId <= 0 || string.IsNullOrEmpty(groupType))
                return BadRequest("Invalid chat ID or group type.");

            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token))
                return Unauthorized("Auth token not found.");

            try
            {
                var url = $"{_baseUrl}/api/FileManagement/GetSharedFiles?chatId={chatId}&groupType={groupType}";
                using var requestMessage = new HttpRequestMessage(HttpMethod.Get, url);
                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                using var response = await _httpClient.SendAsync(requestMessage);
                var responseBody = await response.Content.ReadAsStringAsync();

                return new ContentResult
                {
                    Content = responseBody,
                    ContentType = response.Content.Headers.ContentType?.ToString(),
                    StatusCode = (int)response.StatusCode
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting shared files for chatId {ChatId}", chatId);
                return StatusCode(500, "Internal server error while getting shared files.");
            }
        }
    }
}

/*
 =======================================================================================================================
                                    WEBSERVICE LAYER CODE (For Reference)
 =======================================================================================================================

-------------------------------------------------
-- 1. DTOs (Data Transfer Objects)
-------------------------------------------------

// In your DTOs project/folder
public class SharedFileDto
{
    public long MessageFileId { get; set; }
    public string FileName { get; set; }
    public string FilePath { get; set; }
    public string FileThumbPath { get; set; }
    public long FileSize { get; set; }
    public string FileType { get; set; } // "media", "document"
    public DateTime SentAt { get; set; }
}

public class SharedLinkDto
{
    public long MessageId { get; set; }
    public string LinkUrl { get; set; }
    public DateTime SentAt { get; set; }
}

public class SharedContentDto
{
    public List<SharedFileDto> MediaFiles { get; set; } = new List<SharedFileDto>();
    public List<SharedFileDto> DocumentFiles { get; set; } = new List<SharedFileDto>();
    public List<SharedLinkDto> Links { get; set; } = new List<SharedLinkDto>();
}


-------------------------------------------------
-- 2. IFileManagementService (Interface)
-------------------------------------------------

// In your Services/Interfaces project/folder
public interface IFileManagementService
{
    // ... other methods
    Task<SharedContentDto> GetSharedContentForChatAsync(int chatId, string groupType);
}


-------------------------------------------------
-- 3. FileManagementService (Implementation)
-------------------------------------------------

// In your Services project/folder
public class FileManagementService : IFileManagementService
{
    private readonly YourDbContext _context; // Replace with your actual DbContext

    public FileManagementService(YourDbContext context)
    {
        _context = context;
    }

    // ... other method implementations

    public async Task<SharedContentDto> GetSharedContentForChatAsync(int chatId, string groupType)
    {
        var sharedContent = new SharedContentDto();

        // Define allowed extensions for media and documents
        var mediaExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".mp4", ".mov", ".avi", ".webm", ".mp3", ".wav", ".ogg" };
        var docExtensions = new[] { ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".zip", ".rar" };

        // Determine the message query based on group type
        IQueryable<Message> messagesQuery;
        if (groupType.Equals("ClassGroup", StringComparison.OrdinalIgnoreCase))
        {
            messagesQuery = _context.Messages.Where(m => m.ClassGroupId == chatId);
        }
        else if (groupType.Equals("Channel", StringComparison.OrdinalIgnoreCase))
        {
            messagesQuery = _context.Messages.Where(m => m.ChannelId == chatId);
        }
        else
        {
            return sharedContent; // Or throw an exception for invalid groupType
        }

        // Fetch files
        var files = await messagesQuery
            .SelectMany(m => m.MessageFiles)
            .Where(f => f.IsDeleted == false)
            .OrderByDescending(f => f.Message.MessageDateTime)
            .Select(f => new SharedFileDto
            {
                MessageFileId = f.MessageFileId,
                FileName = f.FileName,
                FilePath = f.FilePath,
                FileThumbPath = f.FileThumbPath,
                FileSize = f.FileSize,
                SentAt = f.Message.MessageDateTime
            })
            .ToListAsync();

        // Categorize files
        foreach (var file in files)
        {
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (mediaExtensions.Contains(extension))
            {
                file.FileType = "media";
                sharedContent.MediaFiles.Add(file);
            }
            else if (docExtensions.Contains(extension))
            {
                file.FileType = "document";
                sharedContent.DocumentFiles.Add(file);
            }
        }

        // Fetch links
        var links = await messagesQuery
            .Where(m => m.MessageText.MessageTxt.Contains("http://") || m.MessageText.MessageTxt.Contains("https://"))
            .OrderByDescending(m => m.MessageDateTime)
            .Select(m => new
            {
                m.MessageId,
                m.MessageText.MessageTxt,
                m.MessageDateTime
            })
            .ToListAsync();

        // Extract links from message text (a simple regex can do this)
        var urlRegex = new Regex(@"(https?:\/\/[^\s]+)");
        foreach (var message in links)
        {
            var matches = urlRegex.Matches(message.MessageTxt);
            foreach (Match match in matches)
            {
                sharedContent.Links.Add(new SharedLinkDto
                {
                    MessageId = message.MessageId,
                    LinkUrl = match.Value,
                    SentAt = message.MessageDateTime
                });
            }
        }

        return sharedContent;
    }
}


-------------------------------------------------
-- 4. FileManagementController (API Controller)
-------------------------------------------------

// In your Controllers project/folder
[Authorize]
[Route("api/[controller]")]
[ApiController]
public class FileManagementController : ControllerBase
{
    private readonly IFileManagementService _fileManagementService;
    private readonly ILogger<FileManagementController> _logger;

    public FileManagementController(IFileManagementService fileManagementService, ILogger<FileManagementController> logger)
    {
        _fileManagementService = fileManagementService;
        _logger = logger;
    }

    // ... other actions

    [HttpGet("GetSharedFiles")]
    public async Task<IActionResult> GetSharedFiles([FromQuery] int chatId, [FromQuery] string groupType)
    {
        if (chatId <= 0 || string.IsNullOrEmpty(groupType))
            return BadRequest("Valid Chat ID and Group Type are required.");

        try
        {
            var sharedContent = await _fileManagementService.GetSharedContentForChatAsync(chatId, groupType);
            return Ok(sharedContent);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching shared content for chat {ChatId} of type {GroupType}", chatId, groupType);
            return StatusCode(500, "An internal error occurred while fetching shared content.");
        }
    }
}
*/

