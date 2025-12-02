using Azure.Core;
using Humanizer;
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
using System.Text;
using System.Text.Json;

namespace Messenger.WebApp.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class ChatController : ControllerBase
    {
        private readonly HttpClient _httpClient;
        private readonly IMessageServiceClient _messageServiceClient;
        private readonly IFileManagementServiceClient _fileService;
        private readonly IRealtimeHubBridgeService _hubBridgeService;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly ILogger<ChatController> _logger;
        private readonly string _baseUrl;

        public ChatController(IRealtimeHubBridgeService hubBridgeService,
            ILogger<ChatController> logger,
            IMessageServiceClient messageServiceClient,
            IHttpContextAccessor httpContextAccessor,
            IFileManagementServiceClient fileManagementServiceClient,
            IOptions<ApiSettings> apiSettings,
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

        public class DownloadFileRequest { public long FileId { get; set; } }

        [HttpGet("downloadFileById")]
        public async Task<IActionResult> DownloadFileById([FromQuery] long fileId)
        {
            if (fileId <= 0) return BadRequest("Request cannot be null.");
            try
            {
                var fileData = await _fileService.GetFileDataAsync(fileId);
                if (fileData == null) return NotFound("File not found.");
                return File(fileData.Content, fileData.ContentType, fileData.FileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in downloadFileById.");
                return StatusCode(500, "Internal server error deleting message.");
            }
        }

        [HttpPost("downloadBlobFileById")]
        public async Task<IActionResult> DownloadFileById([FromBody] DownloadFileRequest request)
        {
            if (request.FileId <= 0) return BadRequest("Request cannot be null.");
            try
            {
                var fileData = await _fileService.GetFileDataAsync(request.FileId);
                if (fileData == null) return NotFound("File not found.");
                return File(fileData.Content, fileData.ContentType, fileData.FileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in DeleteMessage action.");
                return StatusCode(500, "Internal server error deleting message.");
            }
        }

        [HttpPost("deleteMessage")]
        public async Task<IActionResult> DeleteMessage([FromBody] DeleteMessageRequestDto request)
        {
            if (request == null) return BadRequest("Request cannot be null.");
            try
            {
                await _messageServiceClient.DeleteMessageAsync(request);
                return Ok();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in DeleteMessage action.");
                return StatusCode(500, "Internal server error deleting message.");
            }
        }

        [HttpGet("usersWithStatus")]
        public async Task<IActionResult> GetUsersWithStatus([FromQuery] string groupId, [FromQuery] string groupType)
        {
            if (string.IsNullOrEmpty(groupId) || string.IsNullOrEmpty(groupType)) return BadRequest("GroupId and GroupType are required.");
            try
            {
                var users = await _hubBridgeService.GetUsersWithStatusAsync(groupId, groupType);
                return Ok(users);
            }
            catch (Exception ex)
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
                var userId = GetCurrentUserId();
                if (userId <= 0) return BadRequest("Invalid user.");
                await _hubBridgeService.AnnounceUserPresenceAsync(userId);
                return Ok(new { message = "User presence successfully announced." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during user presence announcement.");
                return StatusCode(500, "Failed to announce user presence.");
            }
        }

        private long GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim != null && long.TryParse(userIdClaim.Value, out long userId)) return userId;
            return 0;
        }

        [HttpPost("UploadAudioChunk")]
        [RequestSizeLimit(1024 * 1024 * 1024)]
        public async Task<IActionResult> UploadAudioChunk([FromForm] IFormFile file, [FromForm] string recordingId, [FromForm] int chunkIndex, [FromForm] bool isLastChunk)
        {
            if (file == null || file.Length == 0) return BadRequest("File chunk is required.");
            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token)) return Unauthorized("Auth token not found.");
            try
            {
                using var multipartFormContent = new MultipartFormDataContent();
                using var fileStreamContent = new StreamContent(file.OpenReadStream());
                fileStreamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(file.ContentType);
                multipartFormContent.Add(fileStreamContent, name: "file", fileName: file.FileName);
                multipartFormContent.Add(new StringContent(recordingId), name: "recordingId");
                multipartFormContent.Add(new StringContent(chunkIndex.ToString()), name: "chunkIndex");
                multipartFormContent.Add(new StringContent(isLastChunk.ToString().ToLower()), name: "isLastChunk");
                var url = $"{_baseUrl}/api/FileManagement/UploadAudioChunk";
                using var requestMessage = new HttpRequestMessage(HttpMethod.Post, url);
                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                requestMessage.Content = multipartFormContent;
                using var response = await _httpClient.SendAsync(requestMessage);
                if (response.IsSuccessStatusCode)
                {
                    if (isLastChunk)
                    {
                        var responseBody = await response.Content.ReadAsStringAsync();
                        return Content(responseBody, "application/json");
                    }
                    return Ok();
                }
                var responseBodyFail = await response.Content.ReadAsStringAsync();
                _logger.LogError("External service failed to process audio chunk: {StatusCode} {Body}", response.StatusCode, responseBodyFail);
                return StatusCode((int)response.StatusCode, $"External service error: {response.ReasonPhrase}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error forwarding audio chunk for recordingId {RecordingId}", recordingId);
                return StatusCode(500, "Internal server error while forwarding the audio chunk.");
            }
        }

        [HttpPost("UploadFileChunk")]
        [RequestSizeLimit(1024 * 1024 * 1024)]
        public async Task<IActionResult> UploadFileChunk([FromForm] IFormFile file, [FromForm] string uploadId, [FromForm] int chunkIndex, [FromForm] int totalChunks, [FromForm] string originalFileName)
        {
            if (file == null || file.Length == 0) return BadRequest("File chunk is required.");
            if (string.IsNullOrEmpty(uploadId) || string.IsNullOrEmpty(originalFileName) || chunkIndex < 0 || totalChunks <= 0) return BadRequest("Upload ID, original file name, and valid chunk info are required.");
            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token)) return Unauthorized("Auth token not found.");
            try
            {
                using var multipartFormContent = new MultipartFormDataContent();
                using var fileStreamContent = new StreamContent(file.OpenReadStream());
                fileStreamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(file.ContentType);
                multipartFormContent.Add(fileStreamContent, name: "file", fileName: file.FileName);
                multipartFormContent.Add(new StringContent(uploadId), name: "uploadId");
                multipartFormContent.Add(new StringContent(chunkIndex.ToString()), name: "chunkIndex");
                multipartFormContent.Add(new StringContent(totalChunks.ToString()), name: "totalChunks");
                multipartFormContent.Add(new StringContent(originalFileName), name: "originalFileName");
                var url = $"{_baseUrl}/api/FileManagement/UploadFileChunk";
                using var requestMessage = new HttpRequestMessage(HttpMethod.Post, url);
                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                requestMessage.Content = multipartFormContent;
                using var response = await _httpClient.SendAsync(requestMessage);
                var responseBody = await response.Content.ReadAsStringAsync();
                return new ContentResult { Content = responseBody, ContentType = response.Content.Headers.ContentType?.ToString(), StatusCode = (int)response.StatusCode };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error forwarding file chunk for uploadId {UploadId}", uploadId);
                return StatusCode(500, "Internal server error while forwarding the file chunk.");
            }
        }

        [HttpPost("subscribe")]
        public async Task<IActionResult> Subscribe([FromBody] PushSubscriptionDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Endpoint) || dto.Keys == null || string.IsNullOrWhiteSpace(dto.Keys.P256dh) || string.IsNullOrWhiteSpace(dto.Keys.Auth)) return BadRequest("Invalid subscription payload.");
            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token)) return Unauthorized("Auth token not found.");
            try
            {
                var url = $"{_baseUrl}/api/push/subscribe";
                var json = System.Text.Json.JsonSerializer.Serialize(dto);
                using var requestMessage = new HttpRequestMessage(HttpMethod.Post, url) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                var response = await _httpClient.SendAsync(requestMessage);
                if (response.IsSuccessStatusCode) return Ok();
                var body = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("Push subscribe failed: {Status} {Body}", response.StatusCode, body);
                return StatusCode((int)response.StatusCode, body);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error forwarding push subscribe.");
                return StatusCode(500, "Internal server error while subscribing push.");
            }
        }

        [HttpPost("unsubscribe")]
        public async Task<IActionResult> Unsubscribe([FromBody] UnsubscribeDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Endpoint)) return BadRequest("Invalid unsubscribe payload.");
            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token)) return Unauthorized("Auth token not found.");
            try
            {
                var url = $"{_baseUrl}/api/push/unsubscribe";
                var json = System.Text.Json.JsonSerializer.Serialize(dto);
                using var requestMessage = new HttpRequestMessage(HttpMethod.Post, url) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                var response = await _httpClient.SendAsync(requestMessage);
                if (response.IsSuccessStatusCode) return Ok();
                var body = await response.Content.ReadAsStringAsync();
                _logger.LogWarning("Push unsubscribe failed: {Status} {Body}", response.StatusCode, body);
                return StatusCode((int)response.StatusCode, body);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error forwarding push unsubscribe.");
                return StatusCode(500, "Internal server error while unsubscribing push.");
            }
        }

        [HttpPost("ReportMessage")]
        public async Task<IActionResult> ReportMessage([FromBody] MessageFoulReportDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.FoulDesc) || dto.MessageId == 0)
                return BadRequest("Invalid payload.");

            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token)) return Unauthorized("Auth token not found.");

            try
            {
                // Forward to MessagesController route that expects messageId in path
                var url = $"{_baseUrl}/api/messages/{dto.MessageId}/report";

                // Only the foul description is required in the body by the downstream endpoint,
                // but sending the dto.FoulDesc explicitly avoids confusion.
                var payload = System.Text.Json.JsonSerializer.Serialize(new { FoulDesc = dto.FoulDesc });
                using var requestMessage = new HttpRequestMessage(HttpMethod.Post, url)
                {
                    Content = new StringContent(payload, Encoding.UTF8, "application/json")
                };
                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                using var response = await _httpClient.SendAsync(requestMessage);
                var responseBody = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    // Return downstream body and content-type back to caller
                    return Content(responseBody, response.Content.Headers.ContentType?.ToString() ?? "application/json");
                }

                _logger.LogWarning("Report message failed: {Status} {Body}", response.StatusCode, responseBody);
                return StatusCode((int)response.StatusCode, responseBody);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reporting message.");
                return StatusCode(500, "Internal server error while reporting the message.");
            }
        }


        // New action: accepts messageId and isPinned from jQuery, forwards to API /api/messages/{messageId}/pin
        [HttpPost("PinMessage")]
        public async Task<IActionResult> PinMessage([FromBody] PinMessageRequestDto dto)
        {
            // Validate payload first
            if (dto == null || dto.MessageId <= 0) return BadRequest("Invalid payload.");

            // Consolidated role check (easier to extend and clearer intent)
            var allowedRoles = new[] { ConstRoles.Teacher, ConstRoles.Personel, ConstRoles.Manager };
            var hasPermission = false;
            foreach (var role in allowedRoles)
            {
                if (User.IsInRole(role))
                {
                    hasPermission = true;
                    break;
                }
            }

            if (!hasPermission)
            {
                _logger.LogWarning("User {User} attempted to pin/unpin message {MessageId} without permission.", User.Identity?.Name ?? "unknown", dto.MessageId);
                return Forbid();
            }

            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token)) return Unauthorized("Auth token not found.");

            try
            {
                var url = $"{_baseUrl}/api/messages/{dto.MessageId}/pin";
                var payload = System.Text.Json.JsonSerializer.Serialize(new { IsPinned = dto.IsPinned });

                using var requestMessage = new HttpRequestMessage(HttpMethod.Post, url)
                {
                    Content = new StringContent(payload, Encoding.UTF8, "application/json")
                };
                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                using var response = await _httpClient.SendAsync(requestMessage);
                var responseBody = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    // Return downstream body and content-type back to caller
                    return Content(responseBody, response.Content.Headers.ContentType?.ToString() ?? "application/json");
                }

                _logger.LogWarning("Pin message failed: {Status} {Body}", response.StatusCode, responseBody);
                return StatusCode((int)response.StatusCode, responseBody);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error forwarding pin/unpin request for message {MessageId}", dto.MessageId);
                return StatusCode(500, "Internal server error while pinning/unpinning the message.");
            }
        }


        [HttpGet("GetMessageById")]
        public async Task<IActionResult> GetMessageById([FromQuery] long messageId)
        {
            if (messageId <= 0) return BadRequest("Message ID is required and must be greater than 0.");

            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token)) return Unauthorized("Auth token not found.");

            try
            {
                var url = $"{_baseUrl}/api/messages/{messageId}";
                using var requestMessage = new HttpRequestMessage(HttpMethod.Get, url);
                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                using var response = await _httpClient.SendAsync(requestMessage);
                var responseBody = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    // تبدیل JSON response به MessageDto
                    var options = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                    };

                    var messageDto = System.Text.Json.JsonSerializer.Deserialize<MessageDto>(responseBody, options);
                    
                    if (messageDto == null)
                    {
                        _logger.LogWarning("Failed to deserialize message response for messageId {MessageId}", messageId);
                        return BadRequest("Invalid message data received from server.");
                    }

                    // ایجاد payload برای جاوااسکریپت
                    var payload = CreateMessagePayloadForClient(messageDto);

                    return Ok(payload);
                }

                if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    _logger.LogInformation("Message {MessageId} not found.", messageId);
                    return NotFound("Message not found.");
                }

                _logger.LogWarning("Get message failed: {Status} {Body}", response.StatusCode, responseBody);
                return StatusCode((int)response.StatusCode, responseBody);
            }
            catch (System.Text.Json.JsonException ex)
            {
                _logger.LogError(ex, "Error deserializing message response for messageId {MessageId}", messageId);
                return BadRequest("Invalid message format from server.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving message {MessageId}.", messageId);
                return StatusCode(500, "Internal server error while retrieving the message.");
            }
        }

        /// <summary>
        /// ایجاد payload برای ارسال به جاوااسکریپت
        /// این payload شامل تمام اطلاعات مورد نیاز برای نمایش پیام در مودال است
        /// </summary>
        private object CreateMessagePayloadForClient(MessageDto messageDto)
        {
            object replyMessage = null;
            if (messageDto.ReplyMessageId != null && messageDto.ReplyMessage != null)
            {
                replyMessage = new
                {
                    replyToMessageId = messageDto.ReplyMessageId,
                    senderUserName = messageDto.ReplyMessage.SenderUser?.NameFamily,
                    messageText = messageDto.ReplyMessage.MessageText?.MessageTxt,
                    messageFiles = messageDto.ReplyMessage.MessageFiles?.Select(mf => new
                    {
                        fileName = mf.FileName,
                        fileThumbPath = mf.FileThumbPath,
                        fileSize = mf.FileSize,
                        messageFileId = mf.MessageFileId,
                        originalFileName = mf.OriginalFileName
                    }).ToList()
                };
            }

            object messageFiles = null;
            if (messageDto.MessageFiles != null && messageDto.MessageFiles.Any())
            {
                messageFiles = messageDto.MessageFiles.Select(mf => new
                {
                    fileName = mf.FileName,
                    originalFileName = mf.OriginalFileName,
                    fileThumbPath = mf.FileThumbPath,
                    filePath = mf.FilePath,
                    fileSize = mf.FileSize,
                    messageFileId = mf.MessageFileId,
                    fileType = mf.FileType
                }).ToList();
            }

            // ایجاد messageDetailsJson برای استفاده در ویرایش
            var messageDetailsJson = CreateJsonMessageDetails(messageDto);

            return new
            {
                senderUserId = messageDto.SenderUserId,
                senderUserName = messageDto.SenderUser?.NameFamily,
                messageText = messageDto.MessageText?.MessageTxt ?? "",
                messageDateTime = messageDto.MessageDateTime,
                messageDate = messageDto.MessageDateTime.ToString("yyyy-MM-dd"),
                profilePicName = messageDto.SenderUser?.ProfilePicName,
                messageId = messageDto.MessageId,
                replyToMessageId = messageDto.ReplyMessageId,
                replyMessage = replyMessage,
                messageFiles = messageFiles,
                jsonMessageDetails = messageDetailsJson,
                isReadByAnyRecipient = messageDto.MessageSeenCount > 0,
                isSystemMessage = messageDto.IsSystemMessage,
                isPin = messageDto.IsPin
            };
        }

        /// <summary>
        /// ایجاد JSON details برای ویرایش پیام
        /// این متد از HubConnectionManager الهام گرفته شده است
        /// </summary>
        private string CreateJsonMessageDetails(MessageDto messageDto)
        {
            try
            {
                var messageDetailsForEdit = new
                {
                    messageText = messageDto.MessageText?.MessageTxt,
                    replyToMessageId = messageDto.ReplyMessageId,
                    replyMessage = messageDto.ReplyMessageId != null ? new
                    {
                        senderUserName = messageDto.ReplyMessage?.SenderUser?.NameFamily,
                        messageText = messageDto.ReplyMessage?.MessageText?.MessageTxt
                    } : null,
                    messageFiles = messageDto.MessageFiles?.Select(f => new
                    {
                        messageFileId = f.MessageFileId,
                        fileName = f.FileName,
                        fileThumbPath = f.FileThumbPath,
                        filePath = f.FilePath,
                        originalFileName = f.OriginalFileName
                    })
                };

                return JsonConvert.SerializeObject(messageDetailsForEdit);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating JSON message details");
                return "{}";
            }
        }
    }
}
