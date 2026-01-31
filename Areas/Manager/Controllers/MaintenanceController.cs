using Messenger.Tools;
using Messenger.WebApp.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;

namespace Messenger.WebApp.Areas.Manager.Controllers
{
    [Area("Manager")]
    [Authorize(Roles = ConstRoles.Manager)]
    public class MaintenanceController : Controller
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly string _apiBaseUrl;
        public MaintenanceController(IHttpClientFactory httpClientFactory, IOptions<ApiSettings> apiSettings)
        {
            _httpClientFactory = httpClientFactory;
            _apiBaseUrl = apiSettings.Value.BaseUrl;
        }
        public IActionResult Index()
        {
            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token))
                return Unauthorized("Auth token not found.");

            ViewData["AuthToken"] = token;
            return View();
        }


        // DTO برای دریافت userId در درخواست POST
        public class GetStatusRequest
        {
            public long UserId { get; set; }
        }

        // -------------------------------------------------------------------
        // ۱. اکشن پراکسی برای ریست کامل داده‌ها (ResetAllChatData)
        // -------------------------------------------------------------------
        [HttpPost]
        public async Task<IActionResult> ResetData()
        {
            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token))
                return Unauthorized(); // توکن در کوکی نیست، دسترسی غیرمجاز

            var client = _httpClientFactory.CreateClient();
            // 🔑 قرار دادن توکن در هدر Authorization برای ارسال به API اصلی
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            // API اصلی از متد GET استفاده می‌کند، اما ما آن را از طریق پراکسی POST فراخوانی می‌کنیم.
            var response = await client.GetAsync($"{_apiBaseUrl}/api/Maintenance/ResetAllChatData");

            var content = await response.Content.ReadAsStringAsync();

            // نتیجه API اصلی را با همان وضعیت به کلاینت منتقل می‌کنیم
            if (response.IsSuccessStatusCode)
            {
                return Ok(JsonSerializer.Deserialize<object>(content));
            }

            return StatusCode((int)response.StatusCode, content);
        }

        // -------------------------------------------------------------------
        // ۲. اکشن پراکسی برای گزارش وضعیت کاربر (GetUserStatus)
        // -------------------------------------------------------------------
        [HttpPost]
        public async Task<IActionResult> GetStatus([FromBody] GetStatusRequest request)
        {
            var token = Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token))
                return Unauthorized();

            if (request == null || request.UserId <= 0)
            {
                return BadRequest(new { Success = false, Message = "UserId is required and must be a positive number." });
            }

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            // API اصلی از پارامتر کوئری استفاده می‌کند.
            var response = await client.GetAsync($"{_apiBaseUrl}/api/Maintenance/GetUserStatus?userId={request.UserId}");

            var content = await response.Content.ReadAsStringAsync();

            // نتیجه API اصلی را با همان وضعیت به کلاینت منتقل می‌کنیم
            if (response.IsSuccessStatusCode)
            {
                return Content(content, "application/json");
            }

            return StatusCode((int)response.StatusCode, content);
        }
    }
}
