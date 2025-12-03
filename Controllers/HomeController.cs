using Messenger.DTOs;
using Messenger.Models.Models;
using Messenger.Tools;
using Messenger.WebApp.Models;
using Messenger.WebApp.Models.ViewModels;
using Messenger.WebApp.ServiceHelper;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using System.Net.Http;
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

            try
            {
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
                    ViewData["userProfilePic"] = "UserIcon.png";
                }
            }
            catch (Exception ex)
            {
                ViewData["userProfilePic"] = "UserIcon.png";
                //throw;
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
            //var userGroups = userRole == ConstRoles.Manager ? await _classGroupServiceClient.GetAllClassGroupsAsync() :
            //    await _classGroupServiceClient.GetUserClassGroupsAsync(userId);

            var userGroups = await _classGroupServiceClient.GetUserClassGroupsAsync(userId);


            var userChannels = await _channelServiceClient.GetUserChannelsAsync(userId);


            chatModel.Groups = userGroups;
            chatModel.Channels = userChannels;
            return PartialView("_classGroups", chatModel);

        }

       

        /// <summary>
        /// بدست آوردن پیامهای سنجاق شده یک گروه
        /// </summary>
        /// <param name="chatId"></param>
        /// <param name="groupType"></param>
        /// <param name="pageSize"></param>
        /// <returns></returns>
        public async Task<IActionResult> GetChatPinnedMessages(int chatId, string groupType, int pageSize = 50)
        {
            try
            {
                var userId = HttpContext.User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
                if (userId == null)
                {
                    return BadRequest("User ID not found in claims.");
                }

                var messages = await _messageService.GetChatPinnedMessagesAsync(chatId, groupType, pageSize);

                //var lastReadMessageId = await GetLastReadMessageIdPlaceholderAsync(chatId, groupType, long.Parse(userId));

                return PartialView("_ChatPinnedMessageBody", messages);
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
        public async Task<IActionResult> GetOldMessage(
            int chatId,
            string groupType,
            int pageNumber = 1,
            int pageSize = 50,
            long messageId = 0,
            bool loadOlder = true,
            bool loadBothDirections = false)
        {
            try
            {
                var userId = HttpContext.User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    return BadRequest("User ID not found in claims.");
                }

                List<MessageDto> messages = new List<MessageDto>();

                if (loadBothDirections && messageId > 0)
                {
                    // برای دریافت پیامهای پین شده که ممکن است خیلی قدیمی باشند 25 واحد به ایدی اضافه میکنم
                    // به این دلیل که 25 واحد جدید تر باشه و 25 تا قدیمی تر از ایدی مورد نظر
                   // messageId += 25;
                    var olderMessages = await _messageService.GetChatMessagesAsync(chatId, groupType, 1, 25, messageId, true, loadBothDirections);

                    messages.AddRange(olderMessages ?? new List<MessageDto>());

                    // ✅ تصحیح: مرتب‌سازی صعودی (قدیم → جدید)
                    messages = messages.OrderByDescending(m => m.MessageDateTime).ToList();
                }
                else
                {
                    // کد اصلی: فقط قدیمی‌ها
                   var olderMessages = await _messageService.GetChatMessagesAsync(chatId, groupType, pageNumber, pageSize, messageId, loadOlder, false);

                    // ✅ مرتب‌سازی صعودی برای بارگذاری قدیمی
                    messages = olderMessages.OrderBy(m => m.MessageId).ToList();
                }

                var payloadList = new List<object>();

                if (messages != null && messages.Any())
                {
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
                            messageFiles = messageDto.MessageFiles.Select(mf => new
                            {
                                FileName = mf.FileName,
                                FileThumbPath = mf.FileThumbPath,
                                MessageFileId = mf.MessageFileId,
                                OriginalFileName = mf.OriginalFileName,
                                FileType = mf.FileType,
                                FileSize = mf.FileSize
                            }).ToList();
                        }

                        var payload = new
                        {
                            senderUserId = messageDto.SenderUserId,
                            senderUserName = messageDto.SenderUser.NameFamily,
                            messageText = messageDto.MessageText?.MessageTxt,
                            groupId = messageDto.ClassGroupId,
                            messageDateTime = messageDto.MessageDateTime,
                            messageDate = messageDto.MessageDateTime.Date,
                            profilePicName = messageDto.SenderUser.ProfilePicName,
                            messageId = messageDto.MessageId,
                            replyToMessageId = messageDto.ReplyMessageId,
                            replyMessage = replyMessage,
                            messageFiles = messageFiles,
                            isPin = messageDto.IsPin,
                            isReadByAnyRecipient = messageDto.IsReadByAnyRecipient
                        };
                        payloadList.Add(payload);
                    }
                }

                long lastLoadedMessageId = (messages != null && messages.Any()) ? messages.Last().MessageId : messageId;

                return Json(new { success = true, lastMessageId = lastLoadedMessageId, data = payloadList });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = "An error occurred." });
            }
        }


        #region دریافت چهار حالت پیامها

        /// <summary>
        /// ✅ حالت 1: دریافت پیامهای اولیه بعد از انتخاب چت (اولین بار)
        /// - آخرین 50 پیام را دریافت میکند
        /// - اگر کاربر قبلاً وارد شده، پیامهای حول lastReadMessageId دریافت میکند
        /// </summary>
        /// <param name="chatId">آیدی گروه یا کانال</param>
        /// <param name="groupType">نوع چت (ClassGroup یا Channel)</param>
        /// <param name="pageNumber">شماره صفحه</param>
        /// <param name="pageSize">تعداد پیام در هر صفحه</param>
        /// <returns></returns>
        public async Task<IActionResult> GetChatMessages(int chatId, string groupType, int pageNumber = 1, int pageSize = 50)
        {
            try
            {
                var userId = HttpContext.User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
                if (userId == null)
                {
                    return BadRequest("User ID not found in claims.");
                }

                _logger.LogInformation($"GetChatMessages: Loading initial messages for chat {chatId} (type: {groupType})");

                // دریافت پیامهای اولیه بدون شناخت یک پیام هدف
                // سرور خود تصمیم میگیرد که کدام پیامها را بفرستد
                var messages = await _messageService.GetChatMessagesAsync(
                    chatId,
                    groupType,
                    pageNumber,
                    pageSize,
                    messageId: 0,  // عدم تعیین پیام خاص
                    loadOlder: false,
                    loadBothDirections: false
                );

                ViewData["chatGroupId"] = chatId;
                ViewData["baseUrl"] = _baseUrl;
                ViewData["chatType"] = groupType;

                return PartialView("_ChatMessageBody", messages);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in GetChatMessages");
                return StatusCode(500, "Error loading messages");
            }
        }

        /// <summary>
        /// ✅ حالت 2: دریافت پیامهای قدیمی‌تر (اسکرول به بالا)
        /// - پیامهایی که ID آنها کوچک‌تر از messageId است را دریافت میکند
        /// - استفاده میشود زمانی که کاربر در چت اسکرول کند
        /// </summary>
        /// <param name="chatId">آیدی گروه یا کانال</param>
        /// <param name="groupType">نوع چت</param>
        /// <param name="messageId">آیدی آخرین پیام لود شده (پایین‌ترین)</param>
        /// <param name="pageSize">تعداد پیام برای دریافت</param>
        /// <returns></returns>
        public async Task<IActionResult> GetOlderMessages(int chatId, string groupType, long messageId, int pageSize = 50)
        {
            try
            {
                var userId = HttpContext.User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    return BadRequest("User ID not found in claims.");
                }

                if (messageId <= 0)
                {
                    return BadRequest("Valid messageId is required for loading older messages.");
                }

                _logger.LogInformation($"GetOlderMessages: Loading messages before ID {messageId} for chat {chatId}");

                // دریافت پیامهای قدیمی‌تر
                var messages = await _messageService.GetChatMessagesAsync(
                    chatId,
                    groupType,
                    pageNumber: 1,
                    pageSize: pageSize,
                    messageId: messageId,
                    loadOlder: true,
                    loadBothDirections: false
                );

                return Json(new
                {
                    success = true,
                    data = messages,
                    lastMessageId = messages?.LastOrDefault()?.MessageId ?? 0
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in GetOlderMessages");
                return Json(new { success = false, message = "Error loading older messages" });
            }
        }

        /// <summary>
        /// ✅ حالت 3: دریافت پیامهای جدید‌تر (اسکرول به پایین)
        /// - پیامهایی که ID آنها بزرگ‌تر از messageId است را دریافت میکند
        /// - استفاده میشود هنگام اسکرول به پایین برای دریافت پیامهای جدیدتر
        /// </summary>
        /// <param name="chatId">آیدی گروه یا کانال</param>
        /// <param name="groupType">نوع چت</param>
        /// <param name="messageId">آیدی آخرین پیام نمایش داده شده (بالاترین)</param>
        /// <param name="pageSize">تعداد پیام برای دریافت</param>
        /// <returns></returns>
        public async Task<IActionResult> GetNewerMessages(int chatId, string groupType, long messageId, int pageSize = 50)
        {
            try
            {
                var userId = HttpContext.User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    return BadRequest("User ID not found in claims.");
                }

                if (messageId <= 0)
                {
                    return BadRequest("Valid messageId is required for loading newer messages.");
                }

                _logger.LogInformation($"GetNewerMessages: Loading messages after ID {messageId} for chat {chatId}");

                // دریافت پیامهای جدید‌تر (تقریباً به همان روش قدیمی‌ها اما از سرور آن را تشخیص میدهد)
                var messages = await _messageService.GetChatMessagesAsync(
                    chatId,
                    groupType,
                    pageNumber: 1,
                    pageSize: pageSize,
                    messageId: messageId,
                    loadOlder: false,  // false یعنی جدیدتر
                    loadBothDirections: false
                );

                return Json(new
                {
                    success = true,
                    data = messages,
                    lastMessageId = messages?.FirstOrDefault()?.MessageId ?? 0
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in GetNewerMessages");
                return Json(new { success = false, message = "Error loading newer messages" });
            }
        }

        /// <summary>
        /// ✅ حالت 4: دریافت پیامهای اطراف یک پیام هدف (برای پیامهای پین شده)
        /// - 25 پیام قبل از پیام هدف
        /// - 20 پیام بعد از پیام هدف
        /// - استفاده میشود زمانی که کاربر بر روی پیام پین شده کلیک کند
        /// </summary>
        /// <param name="chatId">آیدی گروه یا کانال</param>
        /// <param name="groupType">نوع چت</param>
        /// <param name="targetMessageId">آیدی پیام هدف (پیام پین شده)</param>
        /// <returns></returns>
        public async Task<IActionResult> GetMessagesAroundTarget(int chatId, string groupType, long targetMessageId)
        {
            try
            {
                var userId = HttpContext.User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    return BadRequest("User ID not found in claims.");
                }

                if (targetMessageId <= 0)
                {
                    return BadRequest("Valid targetMessageId is required.");
                }

                _logger.LogInformation($"GetMessagesAroundTarget: Loading messages around target ID {targetMessageId} in chat {chatId}");

                // دریافت پیامهای اطراف پیام هدف
                // pageSize = 25 سیگنال است برای سرور که بخواهد از هر دو سمت بارگذاری کند
                var messages = await _messageService.GetChatMessagesAsync(
                    chatId,
                    groupType,
                    pageNumber: 1,
                    pageSize: 25,  // پیام خاص برای loadBothDirections
                    messageId: targetMessageId,
                    loadOlder: true,
                    loadBothDirections: true  // دریافت از هر دو سمت
                );

                // ترتیب پیامها از قدیم به جدید برای نمایش صحیح
                var orderedMessages = messages?.OrderBy(m => m.MessageId).ToList() ?? new List<MessageDto>();

                return Json(new
                {
                    success = true,
                    data = orderedMessages,
                    targetMessageId = targetMessageId,
                    firstMessageId = orderedMessages.FirstOrDefault()?.MessageId ?? 0,
                    lastMessageId = orderedMessages.LastOrDefault()?.MessageId ?? 0
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in GetMessagesAroundTarget");
                return Json(new { success = false, message = "Error loading messages around target" });
            }
        }

        #endregion


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
                ImagePath = string.IsNullOrEmpty(m.ProfilePicName) ? "UserIcon.png" : $"/{m.ProfilePicName}",
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
                ViewData["baseUrl"] = _baseUrl;
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

        /// <summary>
        /// شبیه‌ساز برای دریافت شناسه آخرین پیام خوانده شده.
        /// TODO: این یک پیاده‌سازی موقت است. منطق واقعی باید در سرویس پیام پیاده‌سازی شود
        /// و از اینجا فراخوانی گردد تا آخرین پیام خوانده شده توسط کاربر در این چت مشخص شود.
        /// </summary>
        /// <param name="chatId">شناسه چت (گروه یا کانال)</param>
        /// <param name="groupType">نوع چت</param>
        /// <param name="userId">شناسه کاربر</param>
        /// <returns>شناسه آخرین پیام خوانده شده</returns>
        private async Task<long> GetLastReadMessageIdPlaceholderAsync(int chatId, string groupType, long userId)
        {
            //TODO این مقدار را از redis  فراخوانی کنم
            // در پیاده‌سازی واقعی، این متد باید یک سرویس را فراخوانی کند
            // await _messageService.GetLastReadMessageIdAsync(chatId, groupType, userId);
            return await Task.FromResult(0L); // بازگرداندن مقدار ثابت به صورت موقت
        }

        public ActionResult test()
        {
            return View();
        }
    }
}
