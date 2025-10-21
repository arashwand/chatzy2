using Messenger.DTOs;
using Messenger.Tools;
using Messenger.WebApp.Models;
using Messenger.WebApp.Models.ViewModels;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Text.Json;

namespace Messenger.WebApp.Controllers
{
    [Authorize]
    public class HomeController : Controller
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<HomeController> _logger;
        private readonly IUserServiceClient _redisUserService;
        private readonly IClassGroupServiceClient _classGroupServiceClient;
        private readonly IChannelServiceClient _channelServiceClient;
        private readonly IMessageServiceClient _messageService;
        private readonly IFileManagementServiceClient _fileManagementServiceClient;
        private readonly IUserServiceClient _userService;
        private readonly IManageUserServiceClient _manageUserServiceClient;
        private string[] _allowedImageExtentions;
        private string[] _allowedDocExtentions;
        private string[] _allowedAudioExtentions;
        private readonly string _baseUrl;


        // private readonly RedisLastMessageService _redisLastMessage; // Removed
        //private readonly IRedisClient _redisClient; // Added

        public HomeController(ILogger<HomeController> logger, IUserServiceClient redisUserServiceClient,
            IClassGroupServiceClient classGroupServiceClient, IMessageServiceClient messageService,
            IFileManagementServiceClient fileManagementServiceClient, IChannelServiceClient channelServiceClient,
            IUserServiceClient userServiceClient, IOptions<ApiSettings> apiSettings,
            IOptions<FileConfigSetting> fileConfigSettings, IManageUserServiceClient manageUserServiceClient, HttpClient httpClient)
        {
            _logger = logger;
            _redisUserService = redisUserServiceClient;
            _userService = userServiceClient;
            _classGroupServiceClient = classGroupServiceClient;
            _channelServiceClient = channelServiceClient;
            _messageService = messageService;
            _fileManagementServiceClient = fileManagementServiceClient;
            _baseUrl = apiSettings.Value.UploadPath;
            _allowedImageExtentions = fileConfigSettings.Value.AllowedImageExtentions;
            _allowedDocExtentions = fileConfigSettings.Value.AllowedExtensions;
            _allowedAudioExtentions = fileConfigSettings.Value.AllowedAudioExtentions;
            _manageUserServiceClient = manageUserServiceClient;
            _httpClient = httpClient;
        }

        public async Task<IActionResult> Index()
        {
            long userId;
            if (long.TryParse(User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value, out long result))
            {
                userId = result;
            }
            else
            {
                return Unauthorized();
            }

            var user = await _userService.GetUserByIdAsync(userId);

            if (user != null)
            {
                if (user.NameFamily != null && user.NameFamily != "")
                {
                    ViewData["userProfilePic"] = user.ProfilePicName;
                }
                else
                {
                    ViewData["userProfilePic"] = "UserIcon.png";
                }
            }
            else
            {
                ViewData["userProfilePic"] = userId.ToString();
            }

            //ViewData["userProfilePic"] = userId.ToString();
            ViewData["baseUrl"] = _baseUrl;
            ViewData["allowedImagesExtention"] = _allowedImageExtentions;
            return View();
        }



        /// <summary>
        /// گروههایی که کاربر در ان قرار دارد
        /// </summary>
        /// <returns></returns>
        public async Task<IActionResult> GetUserChats()
        {
            long userId;
            if (long.TryParse(User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value, out long result))
            {
                userId = result;
            }
            else
            {
                return Unauthorized();
            }

            //User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
            var userRole = User.Claims.FirstOrDefault(c => c.Type == ClaimTypes.Role)?.Value;
            if (userId <= 0)
            {
                return BadRequest("User ID not found in claims.");
            }

            UserChatModel chatModel = new UserChatModel();

            //اگر مدیر باشد همه گروه ها و کانالها را نمایش میدهیم
            //TODO :  این سناریو موقتی است و درواقع لازم است کلاسها توسط نقش پرسنل مدیریت شوند و باید به این گروهها یا کانالها جوین شوند
            var userGroups = userRole == ConstRoles.Manager ? await _classGroupServiceClient.GetAllClassGroupsAsync() :
                await _classGroupServiceClient.GetUserClassGroupsAsync(userId);


            var userChannels = await _channelServiceClient.GetUserChannelsAsync(userId);


            chatModel.Groups = userGroups;
            chatModel.Channels = userChannels;
            return PartialView("_classGroups", chatModel);

        }

        /// <summary>
        /// گرفتن پیامهای یک گروه
        /// </summary>
        /// <param name="classGroupId"></param>
        /// <param name="pageNumber"></param>
        /// <param name="pageSize"></param>
        /// <returns></returns>
        public async Task<IActionResult> GetChatMessages(int chatId, string groupType, int pageNumber = 1, int pageSize = 50, long messageId = 0)
        {
            try
            {
                var userId = HttpContext.User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
                if (userId == null)
                {
                    return BadRequest("User ID not found in claims.");
                }

                var messages = groupType == ConstChat.ClassGroupType ?
                    await _messageService.GetClassGroupMessagesAsync(chatId, pageNumber, pageSize, messageId) :
                    await _messageService.GetChannelMessagesAsync(chatId, pageNumber, pageSize, messageId);

                ViewData["classGroupId"] = chatId;
                ViewData["baseUrl"] = _baseUrl;
                ViewData["chatType"] = groupType;
                return PartialView("_ChatMessageBody", messages);
            }
            catch (Exception ex)
            {
                _logger.LogError("Error in GetChatMessages " + ex);
                throw;
            }

        }

        /// <summary>
        /// گرفتن پیامهای قبلی
        /// </summary>
        /// <param name="chatId">ایدی گروه یا کانال</param>
        /// <param name="pageNumber"></param>
        /// <param name="pageSize"></param>
        /// <returns></returns>
        public async Task<IActionResult> GetOldMessage(int chatId, string groupType, int pageNumber = 1, int pageSize = 50, long messageId = 0)
        {
            try
            {
                var userId = HttpContext.User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
                if (userId == null)
                {
                    return BadRequest("User ID not found in claims.");
                }

                // تعین اینکه پیام گروه درخواست شده یا پیام کانال
                //TODO برای دریافت پیام خصوصی نیز باید توسعه انجام شود
                var messages = groupType == ConstChat.ClassGroupType ?
                    await _messageService.GetClassGroupMessagesAsync(chatId, pageNumber, pageSize, messageId)
                : await _messageService.GetChannelMessagesAsync(chatId, pageNumber, pageSize, messageId);


                if (messages == null) return null;

                var payloadList = new List<object>();
                foreach (var messageDto in messages)
                {
                    object replyMessage = null;

                    if (messageDto.ReplyMessageId != null && messageDto.ReplyMessage != null)
                    {
                        replyMessage = new
                        {
                            replyToMessageId = messageDto.ReplyMessageId,
                            senderUserName = messageDto.ReplyMessage?.SenderUser?.NameFamily,
                            messageText = messageDto.ReplyMessage?.MessageText?.MessageTxt,
                        };
                    }

                    object messageFiles = null;
                    if (messageDto.MessageFiles != null && messageDto.MessageFiles.Any())
                    {
                        messageFiles = messageDto.MessageFiles.Select(mf => new { FileName = mf.FileName, FileThumbPath = mf.FileThumbPath }).ToList();
                    }

                    var payload = new
                    {
                        senderUserId = messageDto.SenderUserId,
                        senderUserName = messageDto.SenderUser.NameFamily,
                        messageText = messageDto.MessageText?.MessageTxt,
                        groupId = messageDto.ClassGroupId,
                        messageDateTime = messageDto.MessageDateTime,
                        profilePicName = messageDto.SenderUser.ProfilePicName,
                        messageId = messageDto.MessageId,
                        replyToMessageId = messageDto.ReplyMessageId,
                        replyMessage = replyMessage,
                        messageFiles = messageFiles
                    };
                    payloadList.Add(payload);
                }

                if (payloadList.Count() == 0)
                {
                    return Json(new { success = true });
                }

                //--اگر تعداد پیامهای دریافتی کمتر از 50 تا بود یعنی دیگه تموم شده و باید سمت اسکریپت رو با خبر کنم
                return Json(new { success = true, lastMessageId = messages.Last().MessageId, data = payloadList });
                //TODO : در سمت نمایش باید بررسی بشه که تاریخ پیامها در چه روزی هست تا در برچسب مناسب قرار بگیره
                // امروز - دیروز و بر اساس تاریخ روزهای قبل
                // return PartialView("_ChatOldMessageBody", messages);

            }
            catch (Exception ex)
            {
                return Json(new { success = false });
                throw;
            }
        }

        /// <summary>
        /// A helper method to fetch detailed information for a chat (group or channel),
        /// including its name, description, and file counts.
        /// </summary>
        /// <param name="chatId">The ID of the chat.</param>
        /// <param name="groupType">The type of the chat ('ClassGroup' or 'Channel').</param>
        /// <returns>A tuple containing the chat's name, description, and file counts.</returns>
        private async Task<(string Name, string Description, CountSharedContentDto FileCounts)> GetChatDetailsAsync(int chatId, string groupType)
        {
            string name = "نام یافت نشد";
            string description = "";
            CountSharedContentDto fileCounts;

            // Fetch name and description based on chat type
            if (groupType == ConstChat.ClassGroupType)
            {
                var group = await _classGroupServiceClient.GetClassGroupByIdAsync(chatId);
                if (group != null)
                {
                    name = group.LevelName;
                    description = group.ClassTiming;//.Description;
                }
            }
            else
            {
                var channel = await _channelServiceClient.GetChannelByIdAsync(chatId);
                if (channel != null)
                {
                    name = channel.ChannelName;
                    description = channel.ChannelTitle;
                }
            }

            // Fetch file counts from the dedicated service, handling potential nulls
            fileCounts = await _fileManagementServiceClient.GetFileCountsForChatAsync(chatId, groupType);

            return (name, description, fileCounts);
        }

        /// <summary>
        /// گرفتن اعضای یک گروه
        /// </summary>
        /// <param name="chatId"></param>
        /// <returns></returns>
        public async Task<IActionResult> GetChatDetails(int chatId, string groupType)
        {
            var userId = HttpContext.User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
            if (userId == null)
            {
                return BadRequest("User ID not found in claims.");
            }

            // Fetch members in parallel with chat details for better performance
            var membersTask = groupType == ConstChat.ClassGroupType ?
               _classGroupServiceClient.GetClassGroupMembersAsync(chatId) :
               _channelServiceClient.GetChannelMembersAsync(chatId);

            var chatDetailsTask = GetChatDetailsAsync(chatId, groupType);

            var chatfileCount = 1;

            // Await both tasks
            await Task.WhenAll(membersTask, chatDetailsTask);

            var membersDto = await membersTask;
            var chatDetails = await chatDetailsTask;

            bool isAdmin = User.IsInRole(ConstRoles.Manager);
            // Map DTOs to ViewModel
            var memberViewModels = membersDto.Select(m => new ChatMemberViewModel
            {
                UserId = m.UserId,
                FullName = m.NameFamily,
                Status = "Offline", // Default status, will be updated by SignalR on the client
                //ImagePath = string.IsNullOrEmpty(m.ProfilePicName) ? "/assets/media/avatar/UserIcon.png" : $"{_baseUrl}/{m.ProfilePicName}",
                ImagePath = string.IsNullOrEmpty(m.ProfilePicName) ? "/assets/media/avatar/UserIcon.png" : $"/{m.ProfilePicName}",
                RoleName = m.RoleName//m.IsAdmin
            }).ToList();

            var chatDetailsViewModel = new ChatDetailsViewModel
            {
                GroupName = chatDetails.Name,
                GroupDescription = chatDetails.Description,
                Members = memberViewModels,
                MediaFilesCount = chatDetails.FileCounts.MediaFilesCount,
                DocumentFilesCount = chatDetails.FileCounts.DocumentFilesCount,
                LinkFilesCount = chatDetails.FileCounts.LinkFilesCount
            };

            return PartialView("~/Views/Shared/_ChatMembersPanel.cshtml", chatDetailsViewModel);
        }

        [HttpPost]
        public async Task<IActionResult> UploadFiles(IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return Json(new { success = false, message = "هیچ فایلی برای آپلود انتخاب نشده است." });
            }

            // لیست پسوندهای مجاز
            //_allowedDocExtentions

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (string.IsNullOrEmpty(extension) || !_allowedDocExtentions.Contains(extension))
            {
                return BadRequest(new { success = false, message = "نوع فایل مجاز نیست." });
            }

            try
            {

                // با استفاده از using، استریم به طور خودکار بسته می‌شود
                await using var stream = file.OpenReadStream();

                // 3. باید منتظر (await) نتیجه متد آسنکرون بمانید
                var uploadResult = await _fileManagementServiceClient.UploadFileAsync(
                    stream,
                    file.FileName,
                    file.ContentType
                );

                if (uploadResult == null)
                {
                    return Json(new { success = false, message = "سرویس آپلود پاسخی برنگرداند." });
                }

                // 4. نام فیلد خروجی (fileId) باید با چیزی که جاوااسکریپت انتظار دارد یکی باشد
                return Json(new { success = true, fileId = uploadResult }); // فرض می‌کنیم مدل شما یک پراپرتی Id دارد
            }
            catch (Exception ex)
            {
                // لاگ کردن خطا برای بررسی‌های بعدی بسیار مهم است
                // Log.Error(ex, "An error occurred while uploading file.");
                return Json(new { success = false, message = "خطا در آپلود فایل: " + ex.Message });
            }
        }

        /// <summary>
        ///  حذف فایل انتخاب و بارگذاری شده قبل از ارسال به گروه
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> DeleteFile([FromBody] FileIdentifierDto request)
        {
            if (request == null || request.FileId <= 0)
            {
                return Json(new { success = false, message = "شناسه فایل معتبر نیست." });
            }
            try
            {
                await _fileManagementServiceClient.DeleteFileAsync(request.FileId);
                return Json(new { success = true, fileId = request.FileId });
            }
            catch (Exception ex)
            {
                // Log the exception
                return Json(new { success = false, message = "خطا در حذف فایل روی سرور: " + ex.Message });
            }
        }

        /// <summary>
        ///  ذخیره پیام گروه در قسمت پیامهای ذخیره شده کاربر
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> Savemessage(long messageId)
        {
            if (messageId == null || messageId <= 0)
            {
                return Json(new { success = false, message = "شناسه فایل معتبر نیست." });
            }

            try
            {
                await _messageService.SaveMessageAsync(messageId);

                return Json(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError($"error in save message by messageId: {messageId}" + ex.Message);
                return Json(new { success = false, message = "خطا در ذخیره پیام " + ex.Message });
            }
        }

        public async Task<IActionResult> GetSaveMessages()
        {
            try
            {
                var saveMessages = await _messageService.GetSavedMessagesAsync();
                return PartialView("_SaveMessageBody", saveMessages);
                //return Json(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError($"error in get save message " + ex.Message);
                return Json(new { success = false, message = "خطا در بازیابی پیامهای ذخیره شده. " + ex.Message });
            }
        }

        [HttpPost]
        public async Task<IActionResult> DeleteSavedMessage(long messageSavedId)
        {
            try
            {
                await _messageService.DeleteSavedMessageAsync(messageSavedId);
                // return PartialView("_SaveMessageBody", saveMessages);
                return Json(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError($"error in delete saved message " + ex.Message);
                return Json(new { success = false, message = "خطا در حذف پیامهای ذخیره شده. " + ex.Message });
            }
        }

        /// <summary>
        /// دریافت پسوند های مجاز
        /// </summary>
        /// <returns></returns>
        [HttpGet]
        public IActionResult GetAllowedExtensions()
        {
            var allowedImageExtensions = _allowedImageExtentions // لیست رشته‌ها را مستقیماً می‌خواند
                .Select(ext => ext.TrimStart('.').ToLower()) // اطمینان از وجود نقطه در ابتدای پسوند
                .ToArray();

            var allowedExtensions = _allowedDocExtentions
                 .Select(ext => ext.TrimStart('.').ToLower()) // حذف نقطه و تبدیل به حروف کوچک 
                 .ToArray();

            var allowedAudioExtentions = _allowedDocExtentions
                .Select(ext => ext.TrimStart('.').ToLower())
                .ToArray();

            return Ok(new
            {
                AllowedImages = allowedImageExtensions,
                AllowedDocs = allowedExtensions,
                AllowedAudios = allowedAudioExtentions
            });
        }


        [HttpGet]
        public IActionResult GetBaseURL()
        {
            return Ok(new { baseUrl = _baseUrl });
        }

        /// <summary>
        /// داده‌های اولیه چت را به صورت یکپارچه دریافت می‌کند.
        /// این متد به عنوان پروکسی برای سرویس اصلی عمل می‌کند.
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> GetInitialChatData([FromBody] GetInitialChatDataRequest request)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token))
            {
                return Unauthorized("Auth token not found.");
            }

            try
            {
                // آدرس اندپوینت واقعی در سرویس اصلی
                var url = $"{_baseUrl}api/Chat/GetInitialChatData";

                using var requestMessage = new HttpRequestMessage(HttpMethod.Post, url);
                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                // سریالایز کردن بدنه درخواست
                var jsonRequest = JsonSerializer.Serialize(request);
                requestMessage.Content = new StringContent(jsonRequest, System.Text.Encoding.UTF8, "application/json");

                using var response = await _httpClient.SendAsync(requestMessage);

                if (!response.IsSuccessStatusCode)
                {
                    // اگر سرویس با خطا مواجه شد، پاسخ خطا را به کلاینت برگردان
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogError("Error from external API for GetInitialChatData: {StatusCode} - {Content}", response.StatusCode, errorContent);
                    return StatusCode((int)response.StatusCode, errorContent);
                }

                var responseBody = await response.Content.ReadAsStringAsync();
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var result = JsonSerializer.Deserialize<GetInitialChatDataResult>(responseBody, options);

                // بازگرداندن نتیجه موفقیت‌آمیز به کلاینت
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error proxying GetInitialChatData for chatId {ChatId}", request.ChatId);
                return StatusCode(500, "Internal server error while fetching initial chat data.");
            }
        }

        //[HttpGet("GetGroupSharedFilesPartial")]
        public async Task<IActionResult> GetGroupSharedFilesPartial(int chatId, string groupType, string activeTab = "media-tab")
        {
            if (chatId <= 0 || string.IsNullOrEmpty(groupType))
                return BadRequest("Invalid chat ID or group type.");

            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token))
                return Unauthorized("Auth token not found.");

            try
            {
                var url = $"{_baseUrl}api/FileManagement/GetSharedFiles?chatId={chatId}&groupType={groupType}";
                using var requestMessage = new HttpRequestMessage(HttpMethod.Get, url);
                requestMessage.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

                using var response = await _httpClient.SendAsync(requestMessage);

                if (!response.IsSuccessStatusCode)
                {
                    // اگر سرویس با خطا مواجه شد، یک پیام مناسب در Partial View نمایش می‌دهیم
                    return PartialView("_GroupFilesSharedContent", new SharedContentDto());
                }

                var responseBody = await response.Content.ReadAsStringAsync();

                // Deserialize کردن JSON به ViewModel
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var viewModel = JsonSerializer.Deserialize<SharedContentDto>(responseBody, options);

                viewModel.ActiveTab = activeTab;
                viewModel.BaseUrl = _baseUrl;

                // بازگرداندن Partial View به همراه مدل
                return PartialView("_GroupFilesSharedContent", viewModel);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting shared files for chatId {ChatId}", chatId);
                return StatusCode(500, "Internal server error while getting shared files.");
            }
        }


    }
}
