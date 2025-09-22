using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using System.Security.Claims;
using System.Text;
using Messenger.WebApp.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Identity;
using Messenger.WebApp.Helpers;
using Microsoft.AspNetCore.Http.Headers;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Messenger.WebApp.ServiceHelper;
using Messenger.DTOs;
using Messenger.WebApp;

namespace WebAppTest_SSO.Controllers
{
    public class AccountController : Controller
    {

        private readonly JwtSettings _jwtSettings;
        private readonly IUserServiceClient _userServiceClient;
        private readonly IManageUserServiceClient _manageUserServiceClient;
        private readonly ILogger<AccountController> _logger;

        private readonly RequestUriHelper _uriHelper;
        public AccountController(IOptions<JwtSettings> jwtSettings,
            IUserServiceClient userServiceClient,
            ILogger<AccountController> logger,
            IManageUserServiceClient manageUserServiceClient)
        {
            _jwtSettings = jwtSettings.Value;
            _uriHelper = new RequestUriHelper(jwtSettings);
            _userServiceClient = userServiceClient;
            _logger = logger;
            _manageUserServiceClient = manageUserServiceClient;
        }
        public IActionResult Login()
        {
            return View();
        }

        [HttpPost]
        public async Task<IActionResult> Login(LoginVM model)
        {
            try
            {

                if (string.IsNullOrEmpty(model.LoginCode) || model.LoginCode.Trim() == null)
                {
                    ModelState.AddModelError(string.Empty, "لطفا اطلاعات ورود را وارد نمایید!");
                }

                // ارسال اطلاعات ورود به سرویس‌دهنده
                using (var client = new HttpClient())
                {
                    var credentials = new
                    {
                        model.LoginCode,
                        model.Password,
                        Audience = "webApp"
                    };

                    var content = new StringContent(JsonConvert.SerializeObject(credentials), Encoding.UTF8, "application/json");
                    Uri requestUri = _uriHelper.CreateRequestUri("Api/Auth/login");
                    var response = await client.PostAsync(requestUri, content);

                    if (response.IsSuccessStatusCode)
                    {
                        var token = await response.Content.ReadAsStringAsync();
                        //--ابتدا پاسخ دریافتی را تبدیل به مدل پاسخ میکنیم
                        var responseModel = JsonConvert.DeserializeObject<ResponseModel>(token);

                        if (responseModel == null || responseModel.AccessToken == null)
                        {
                            return View();
                        }

                        // ذخیره اکسس توکن در کوکی
                        HttpContext.Response.Cookies.Append("AuthToken", responseModel.AccessToken, new CookieOptions
                        {
                            HttpOnly = true,
                            Secure = true,
                            Expires = responseModel.Expires
                        });

                        // ذخیره ریفرش توکن در کوکی بصورت انکریپت شده
                        // انکریپت کردن ریفرش توکن 
                        var refreshTokenEncrypted = PasswordHelper.Encrypt(responseModel.RefreshToken);
                        HttpContext.Response.Cookies.Append("RefreshToken", refreshTokenEncrypted, new CookieOptions
                        {
                            HttpOnly = true,
                            Secure = true,
                            Expires = DateTimeOffset.UtcNow.AddDays(7) //--ریفرش توکن ما 7 روز اعتبار دارد
                        });


                        // استخراج ایدی کاربر از توکن دریافت شده
                        //var userId = GetUserIdFromToken(responseModel.AccessToken);
                        //var userRoleName = GetRoleNameFromToken(responseModel.AccessToken);

                        var userModel = GetUserInfoFromToken(responseModel.AccessToken);

                        //--اگر بخواهیم مقادیری که در توکن نهفته است را باز گشایی کنیم به صورت زیر عمل میکنیم
                        //--کد زیر را در صورتی استفاده میکنیم که کلید رمزنگاری را داشته باشیم-
                        //کد در فایل appsetting  قرار دارد
                        //var userClimsInToken = JwtHelper.GetClaimsFromToken(responseModel.AccessToken, "dGhpcy1pcy1hLXNlY3JldC1rZXktZm9yLWRldi1lbnY=");
                        //foreach (var claim in userClimsInToken)
                        //{
                        //    string res = $"type: {claim.Type}, value: {claim.Value}";
                        //}



                        var claims = new List<Claim>
                        {
                            new Claim(ClaimTypes.Role, userModel.RoleName),
                            new Claim(ClaimTypes.NameIdentifier, userModel.UserId.ToString()),
                            new Claim("UserId", userModel.UserId.ToString()),
                            new Claim("NameFamily", userModel.FullName),
                            new Claim("accessToken", responseModel.AccessToken),
                            new Claim("refreshTokenEncrypted", refreshTokenEncrypted),
                            new Claim("PortalRoleId", userModel.PortalRoleId.ToString()),
                            new Claim("BranchId", userModel.BranchId.ToString()),
                            new Claim("PersonelId", userModel.PersonelId.ToString()),
                            new Claim("TeacherId", userModel.TeacherId.ToString()),
                            new Claim("StudentId", userModel.StudentId.ToString()),
                            new Claim("MentorId", userModel.MentorId.ToString()),
                        };

                        var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
                        var claimsPrincipal = new ClaimsPrincipal(claimsIdentity);

                        // ورود کاربر و ذخیره کلایم‌ها در کوکی  
                        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
                            claimsPrincipal, new AuthenticationProperties
                            {

                                IsPersistent = true,
                                ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7) //--ریفرش توکن ما 7 روز اعتبار دارد
                            });

                        return Redirect("/");
                    }
                    else
                    {
                        // مدیریت خطا
                        ModelState.AddModelError(string.Empty, "نام کاربری یا رمز عبور اشتباه است!"/*response.StatusCode.ToString()*/);
                    }
                }

                return View(model);
            }
            catch (Exception ex)
            {
                ModelState.AddModelError(string.Empty, "پاسخی از سرور SSO  دریافت نشد");
                return View(model);
            }
        }


        /// <summary>
        /// کافیه اکسس توکن دریافتی رو بهش بدیم
        /// </summary>
        /// <returns></returns>
        private UserInfoVM GetUserInfoFromToken(string token)
        {
            var handler = new JwtSecurityTokenHandler();
            var jwtToken = handler.ReadJwtToken(token);
            var name = jwtToken.Claims.First(c => c.Type == "NameFamily")?.Value;
            var roleName = jwtToken.Claims.First(c => c.Type == ClaimTypes.Role).Value;
            var userId = int.Parse(jwtToken.Claims.First(c => c.Type == ClaimTypes.NameIdentifier).Value);
            var portalRoleId = int.Parse(jwtToken.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value ?? "-1");
            var branchId = int.Parse(jwtToken.Claims.FirstOrDefault(c => c.Type == "BranchId")?.Value ?? "-1");
            var personelId = int.Parse(jwtToken.Claims.FirstOrDefault(c => c.Type == "PersonelId")?.Value ?? "-1");
            var teacherId = int.Parse(jwtToken.Claims.FirstOrDefault(c => c.Type == "TeacherId")?.Value ?? "-1");
            var studentId = int.Parse(jwtToken.Claims.FirstOrDefault(c => c.Type == "StudentId")?.Value ?? "-1");
            var mentorId = int.Parse(jwtToken.Claims.FirstOrDefault(c => c.Type == "MentorId")?.Value ?? "-1");

            var userModel = new UserInfoVM
            {
                accessToken = token,
                FullName = name,
                RoleName = roleName,
                RoleTitle = name,
                UserId = userId,
                PortalRoleId = portalRoleId,
                BranchId = branchId,
                MentorId = mentorId,
                PersonelId = personelId,
                StudentId = studentId,
                TeacherId = teacherId
            };

            return userModel;
        }


        [Authorize]
        [HttpPost]
        //[HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            using (var client = new HttpClient())
            {
                // خواندن توکن از کوکی یا هر محل دیگری که ذخیره شده است
                var token = HttpContext.Request.Cookies["AuthToken"]; // یا از یک روش دیگر بخوانید

                if (!string.IsNullOrEmpty(token))
                {
                    // تنظیم هدر Authorization
                    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                    // ارسال درخواست به متد Logout
                    Uri requestUri = _uriHelper.CreateRequestUri("Api/Auth/logout");
                    var response = await client.PostAsync(requestUri, null);


                    if (response.IsSuccessStatusCode)
                    {
                        // موفقیت در Logout                        

                        // حذف کوکی احراز هویت
                        HttpContext.Response.Cookies.Delete("AuthToken");

                        // حذف کوکی احراز هویت
                        Response.Cookies.Delete("IdentityCookie");
                        // حذف کوکی ریفرش توکن
                        Response.Cookies.Delete("RefreshToken");

                        // هدایت به صفحه لاگین یا صفحه دیگر
                        return RedirectToAction("Login", "Account");
                    }
                    else
                    {
                        // مدیریت خطا
                        ViewData["message"] = response.StatusCode;
                        return View();
                    }
                }
                else
                {
                    // توکن موجود نیست
                    ViewData["message"] = "توکن موجود نیست!";
                    return View();
                }
            }

        }


    }
}
