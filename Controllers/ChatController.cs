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
        [RequestSizeLimit(10 * 1024 * 1024)]
        public async Task<IActionResult> UploadAudioChunk([FromForm] IFormFile file, [FromForm] string recordingId, [FromForm] int chunkIndex, [FromForm] bool isLastChunk)
        {
            if (file == null || file.Length == 0)
                return BadRequest("File chunk is required.");

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
                multipartFormContent.Add(fileStreamContent, name: "file", fileName: file.FileName);

                // Add other form data fields
                multipartFormContent.Add(new StringContent(recordingId), name: "recordingId");
                multipartFormContent.Add(new StringContent(chunkIndex.ToString()), name: "chunkIndex");
                multipartFormContent.Add(new StringContent(isLastChunk.ToString().ToLower()), name: "isLastChunk");

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
    }
}

/*
======================================================================================================================
// SECTION 1: CODE FOR EXTERNAL WEB SERVICE - FileManagementService.cs
======================================================================================================================

// 1. Add this method declaration to your IFileManagementService.cs interface:
/*
using Messenger.DTOs;
using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

public interface IFileManagementService
{
    // ... your other methods
    Task<MessageFileDto?> ProcessAudioChunkAsync(IFormFile file, string recordingId, int chunkIndex, bool isLastChunk, long uploaderUserId);
}
*/

// 2. Add this full method implementation to your FileManagementService.cs class.
//    Make sure you have the 'NAudio' NuGet package installed in this project.
//    Make sure you add 'using NAudio.Wave;' at the top of the file.
/*
public async Task<MessageFileDto?> ProcessAudioChunkAsync(IFormFile file, string recordingId, int chunkIndex, bool isLastChunk, long uploaderUserId)
{
    // Create a temporary directory for this specific recording session
    var tempDirectory = Path.Combine(Path.GetTempPath(), "AudioChunks", recordingId);
    Directory.CreateDirectory(tempDirectory);

    // Define the path for the current chunk, padded with zeros for correct ordering
    var chunkFilePath = Path.Combine(tempDirectory, $"{chunkIndex:D5}.tmp");

    // Save the current chunk to the temporary path
    await using (var stream = new FileStream(chunkFilePath, FileMode.Create))
    {
        await file.CopyToAsync(stream);
    }

    // If this is an intermediate chunk, we're done for now.
    if (!isLastChunk)
    {
        return null;
    }

    // --- Logic for the LAST chunk ---
    _logger.LogInformation($"Processing final chunk for recordingId: {recordingId}");

    // Get all temporary chunk files, order them by name (which is the chunk index)
    var chunkFiles = Directory.GetFiles(tempDirectory, "*.tmp").OrderBy(f => f).ToList();

    // Create a MemoryStream to hold the final, combined file
    await using var finalFileStream = new MemoryStream();

    // Combine all chunks into the final stream
    foreach (var chunkFile in chunkFiles)
    {
        await using (var chunkStream = new FileStream(chunkFile, FileMode.OpenRead))
        {
            await chunkStream.CopyToAsync(finalFileStream);
        }
    }
    finalFileStream.Position = 0; // Reset the stream position to the beginning

    // To use your existing service logic, create an IFormFile from the final MemoryStream
    var finalFormFile = new FormFile(finalFileStream, 0, finalFileStream.Length, "voice.webm", $"{recordingId}.webm")
    {
        Headers = new HeaderDictionary(),
        ContentType = "audio/webm" // You can also pass this from the client if needed
    };

    // Use your existing 'UploadFileAsync' method to save the final file and create a DB record
    var fileIdentifier = await UploadFileAsync(finalFormFile, uploaderUserId);

    if (fileIdentifier == null || fileIdentifier.FileId <= 0)
    {
        Directory.Delete(tempDirectory, true); // Clean up temp files on failure
        _logger.LogError($"Failed to save the final assembled audio file for recordingId: {recordingId}");
        return null;
    }

    // --- Calculate Audio Duration using NAudio ---
    finalFileStream.Position = 0; // Reset stream again for reading
    double durationInSeconds = 0;
    string durationFormatted = "0:00";
    try
    {
        using (var waveFileReader = new WaveFileReader(finalFileStream))
        {
            durationInSeconds = waveFileReader.TotalTime.TotalSeconds;
            durationFormatted = $"{(int)waveFileReader.TotalTime.TotalMinutes}:{waveFileReader.TotalTime.Seconds:D2}";
        }
    }
    catch (Exception waveEx)
    {
        _logger.LogWarning(waveEx, $"NAudio could not read the final audio stream for {recordingId}. Defaulting duration.");
    }

    // Clean up the temporary directory
    Directory.Delete(tempDirectory, true);

    // Return a DTO with the necessary information for the SignalR message
    return new MessageFileDto
    {
        MessageFileId = fileIdentifier.FileId,
        Duration = durationInSeconds,
        DurationFormatted = durationFormatted
    };
}
*/


/*
======================================================================================================================
// SECTION 2: CODE FOR EXTERNAL WEB SERVICE - FileManagementController.cs
======================================================================================================================

// Add this action method to your FileManagementController.cs class.
// Make sure you have injected `IHubContext<YourChatHub>` in your controller's constructor.
// Replace `YourChatHub` with the actual name of your SignalR hub class.

/*
// Example constructor dependency injection:
private readonly IFileManagementService _fileManagementService;
private readonly IHubContext<YourChatHub> _hubContext;
private readonly ILogger<FileManagementController> _logger;

public FileManagementController(
    IFileManagementService fileManagementService,
    IHubContext<YourChatHub> hubContext,
    ILogger<FileManagementController> logger)
{
    _fileManagementService = fileManagementService;
    _hubContext = hubContext;
    _logger = logger;
}
*/

/*
[HttpPost("UploadAudioChunk")]
[Authorize] // Ensure only authenticated users can access this endpoint
[RequestSizeLimit(10 * 1024 * 1024)] // Set a reasonable size limit for each chunk
public async Task<IActionResult> UploadAudioChunk([FromForm] IFormFile file, [FromForm] string recordingId, [FromForm] int chunkIndex, [FromForm] bool isLastChunk)
{
    if (file == null || string.IsNullOrEmpty(recordingId))
        return BadRequest("File, recordingId, and chunkIndex are required.");

    try
    {
        // Get the authenticated user's ID from the JWT claims
        var userIdString = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!long.TryParse(userIdString, out var userId))
        {
            return Unauthorized("Invalid user identifier in token.");
        }

        // Call the service method to process the chunk
        var resultDto = await _fileManagementService.ProcessAudioChunkAsync(file, recordingId, chunkIndex, isLastChunk, userId);

        // If it was the last chunk, the service method will return a DTO.
        if (isLastChunk)
        {
            if (resultDto == null)
            {
                // If processing the final chunk failed in the service
                return StatusCode(500, new { success = false, message = "Failed to process the final audio file." });
            }

            // **** IMPORTANT: Send notification via SignalR ****
            // The result is sent back to the specific user who initiated the upload.
            // "ReceiveVoiceMessageResult" is the custom event name the client is listening for.
            await _hubContext.Clients.User(userId.ToString()).SendAsync("ReceiveVoiceMessageResult", new
            {
                Success = true,
                FileId = resultDto.MessageFileId,
                Duration = resultDto.Duration,
                DurationFormatted = resultDto.DurationFormatted,
                RecordingId = recordingId // Include the original recordingId for the client to match the response
            });

            // Return a simple Ok. The client is not expecting file data in this HTTP response.
            return Ok(new { success = true, message = "Final chunk received and processed. Result sent via SignalR." });
        }
        else
        {
            // For intermediate chunks, just acknowledge receipt.
            return Ok(new { success = true, message = "Chunk received." });
        }
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error processing audio chunk for recordingId {RecordingId}", recordingId);
        return StatusCode(500, new { success = false, message = "An internal server error occurred while processing the audio chunk." });
    }
}
*/
