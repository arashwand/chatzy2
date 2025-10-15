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
using NAudio.Wave;

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

        /// <summary>
        /// قطعات فایل صوتی ضبط شده را دریافت، ذخیره موقت و در نهایت ترکیب می‌کند.
        /// </summary>
        /// <param name="file">قطعه فایل صوتی ارسالی</param>
        /// <param name="recordingId">شناسه یکتای عملیات ضبط برای گروه‌بندی قطعات</param>
        /// <param name="chunkIndex">شماره ترتیب این قطعه</param>
        /// <param name="isLastChunk">آیا این آخرین قطعه است یا خیر</p
        /// <returns>در صورت موفقیت در آخرین قطعه، اطلاعات فایل نهایی را برمی‌گرداند</returns>
        [HttpPost("UploadAudioChunk")]
        [RequestSizeLimit(10 * 1024 * 1024)] // تعیین یک محدودیت معقول برای حجم هر قطعه (مثلاً 10 مگابایت)
        public async Task<IActionResult> UploadAudioChunk([FromForm] IFormFile file, [FromForm] string recordingId, [FromForm] int chunkIndex, [FromForm] bool isLastChunk)
        {
            // --- 1. اعتبارسنجی ورودی ---
            if (file == null || file.Length == 0)
                return BadRequest("فایل قطعه ارسال نشده است.");

            if (string.IsNullOrEmpty(recordingId) || !Guid.TryParse(recordingId, out _))
                return BadRequest("شناسه ضبط نامعتبر است.");

            try
            {
                // --- 2. مدیریت ذخیره‌سازی موقت ---
                // یک مسیر امن و موقت برای ذخیره قطعات این ضبط خاص ایجاد می‌کنیم
                var tempDirectory = Path.Combine(Path.GetTempPath(), "AudioChunks", recordingId);
                Directory.CreateDirectory(tempDirectory); // اگر پوشه وجود نداشته باشد، آن را ایجاد کن

                // نام فایل قطعه را بر اساس شماره ترتیب آن تعیین می‌کنیم تا قابل مرتب‌سازی باشد
                var chunkFilePath = Path.Combine(tempDirectory, $"{chunkIndex:D5}.tmp"); // D5 برای پدینگ با صفر است (00001, 00002, ...)

                // قطعه فعلی را در مسیر موقت ذخیره کن
                await using (var stream = new FileStream(chunkFilePath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                // --- 3. بررسی اینکه آیا آخرین قطعه است یا خیر ---
                if (!isLastChunk)
                {
                    // اگر قطعه میانی بود، فقط یک پاسخ موفقیت‌آمیز برگردان. کلاینت منتظر پاسخ نیست.
                    return Ok();
                }
                else
                {
                    // --- 4. پردازش آخرین قطعه و ترکیب فایل نهایی ---
                    _logger.LogInformation($"درحال پردازش آخرین قطعه برای ضبط با شناسه: {recordingId}");

                    // تمام فایل‌های موقت مربوط به این ضبط را پیدا کرده و بر اساس نام (که همان شماره ترتیب است) مرتب کن
                    var chunkFiles = Directory.GetFiles(tempDirectory, "*.tmp").OrderBy(f => f).ToList();

                    // یک MemoryStream برای نگهداری فایل نهایی ایجاد کن
                    await using var finalFileStream = new MemoryStream();

                    foreach (var chunkFile in chunkFiles)
                    {
                        await using (var chunkStream = new FileStream(chunkFile, FileMode.OpenRead))
                        {
                            await chunkStream.CopyToAsync(finalFileStream);
                        }
                    }
                    finalFileStream.Position = 0; // پوینتر استریم را به ابتدا برگردان

                    // --- 5. ذخیره فایل نهایی با استفاده از سرویس فایل ---
                    var userId = GetCurrentUserId(); // متد کمکی برای گرفتن شناسه کاربر از توکن
                    var originalFileName = $"{recordingId}.webm"; // یک نام پیش‌فرض برای فایل

                    // فراخوانی سرویس برای آپلود فایل نهایی. فرض می‌شود متد UploadFileAsync در سرویس شما وجود دارد
                    // و یک DTO شامل شناسه فایل و سایر اطلاعات را برمی‌گرداند.
                    var uploadedFileDto = await _fileService.UploadFileAsync(finalFileStream, originalFileName, file.ContentType, userId);
                    if (uploadedFileDto == null || uploadedFileDto.MessageFileId <= 0)
                    {
                        // اگر آپلود ناموفق بود، پوشه موقت را پاک کرده و خطا برگردان
                        Directory.Delete(tempDirectory, true);
                        return StatusCode(500, "خطا در ذخیره فایل نهایی در سرویس فایل.");
                    }

                    // --- 6. محاسبه مدت زمان صدا ---
                    finalFileStream.Position = 0; // استریم را برای خواندن توسط NAudio به ابتدا برگردان
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
                        _logger.LogWarning(waveEx, "NAudio could not read the audio file stream. Defaulting duration to 0.");
                        // در صورت بروز خطا، از مقادیر پیش‌فرض استفاده می‌شود تا برنامه متوقف نشود
                    }


                    // --- 7. پاک‌سازی ---
                    // پس از موفقیت، پوشه و فایل‌های موقت را حذف کن
                    Directory.Delete(tempDirectory, true);

                    _logger.LogInformation($"فایل صوتی با شناسه {uploadedFileDto.MessageFileId} با موفقیت از قطعات ایجاد شد.");

                    // --- 8. ارسال پاسخ موفقیت‌آمیز به کلاینت ---
                    // کلاینت منتظر این پاسخ است تا UI پیش‌نمایش را نمایش دهد
                    return Ok(new
                    {
                        Success = true,
                        FileId = uploadedFileDto.MessageFileId,
                        Duration = durationInSeconds, // مدت زمان به ثانیه
                        DurationFormatted = durationFormatted // مدت زمان فرمت شده
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"خطا در پردازش قطعه صوتی برای ضبط با شناسه: {recordingId}");

                // در صورت بروز خطا، بهتر است فایل‌های موقت پاک شوند
                var tempDirectory = Path.Combine(Path.GetTempPath(), "AudioChunks", recordingId);
                if(Directory.Exists(tempDirectory))
                {
                    Directory.Delete(tempDirectory, true);
                }

                return StatusCode(500, "خطای داخلی سرور در پردازش قطعه فایل.");
            }
        }
    }
}
