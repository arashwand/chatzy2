using Newtonsoft.Json;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using Messenger.WebApp.Models;
using Messenger.WebApp.Helpers;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json.Linq;

namespace Messenger.WebApp.Middlewares
{
    public class TokenRefreshMiddleware
    {
        private readonly RequestDelegate _next;

        public TokenRefreshMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        /// <summary>  
        /// در هر درخواست کاربر بررسی میکند ایا اعتبار دارد یا خیر و اقدام به ریفرش توکن در صورت لزوم میکند  
        /// </summary>  
        /// <param name="context"></param>  
        /// <returns></returns>  
        public async Task InvokeAsync(HttpContext context)
        {
            // لیست آدرس‌هایی که نیاز به بررسی ندارند  
            var excludedPaths = new[] { "/Account/Login", "/Account/Register" };

            // لیست فایل‌های ثابت که نیاز به بررسی ندارند  
            var staticFileExtensions = new[] { ".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot" };

            // اگر آدرس درخواست در لیست است یا فایل ثابت است، متد بعدی را صدا بزن و بررسی نکن  
            if (excludedPaths.Any(path => context.Request.Path.StartsWithSegments(path, StringComparison.OrdinalIgnoreCase)) ||
                staticFileExtensions.Any(ext => context.Request.Path.Value.EndsWith(ext, StringComparison.OrdinalIgnoreCase)))
            {
                await _next(context);
                return;
            }

            var token = context.Request.Cookies["AuthToken"];
            if (string.IsNullOrEmpty(token))
            {
                //TODO : بررسی بشه اگه ریفرش توکن داره، از ریفرش توکن برای تمدید استفاده بشه
                // اگر توکن وجود ندارد، به صفحه لاگین هدایت می‌شود  
                RedirectToLogin(context);
                return;
            }

            var refreshTokenInLoginCookie = context.Request.Cookies["RefreshToken"];

            if (!string.IsNullOrEmpty(token) && !string.IsNullOrEmpty(refreshTokenInLoginCookie))
            {
                var tokenHandler = new JwtSecurityTokenHandler();
                var jwtToken = tokenHandler.ReadToken(token) as JwtSecurityToken;

                var expiration = jwtToken.ValidTo;


                if (expiration <= DateTime.UtcNow.AddHours(3.5).AddMinutes(5)) // اگر کمتر از ۵ دقیقه به انقضا مانده باشد  
                {
                    // درخواست ریفرش توکن  
                    await TryToNewTokenByReftreshToken(context, tokenHandler, refreshTokenInLoginCookie, token);
                }
                
            }

            await _next(context);
        }

        private async Task TryToNewTokenByReftreshToken(HttpContext context, JwtSecurityTokenHandler tokenHandler,
            string refreshTokenInLoginCookie, string token)
        {
            // درخواست ریفرش توکن  
            var refreshToken = PasswordHelper.Decrypt(refreshTokenInLoginCookie);
            var jwtRefreshToken = tokenHandler.ReadToken(token) as JwtSecurityToken;

            var expirationRefreshToken = jwtRefreshToken.ValidTo;
            if (expirationRefreshToken > DateTime.UtcNow)
            {
                var newToken = await RefreshTokenAsync(refreshToken);
                if (!string.IsNullOrEmpty(newToken))
                {
                    //--ابتدا پاسخ دریافتی را تبدیل به مدل پاسخ میکنیم  
                    var responseModel = JsonConvert.DeserializeObject<ResponseModel>(newToken);
                    if (responseModel != null && responseModel.AccessToken != null && responseModel.RefreshToken != null)
                    {
                        //  ابتدا کوکی های قبلی حذف میشوند  
                        context.Response.Cookies.Delete("AuthToken");
                        context.Response.Cookies.Delete("RefreshToken");

                        // ذخیره اکسس توکن در کوکی  
                        context.Response.Cookies.Append("AuthToken", responseModel.AccessToken, new CookieOptions
                        {
                            HttpOnly = true,
                            Secure = true,
                            Expires = responseModel.Expires
                        });

                        // ذخیره ریفرش توکن در کوکی بصورت انکریپت شده  
                        // انکریپت کردن ریفرش توکن  
                        var refreshTokenEncrypted = PasswordHelper.Encrypt(responseModel.RefreshToken);
                        context.Response.Cookies.Append("RefreshToken", refreshTokenEncrypted, new CookieOptions
                        {
                            HttpOnly = true,
                            Secure = true,
                            Expires = DateTimeOffset.UtcNow.AddDays(7) //--ریفرش توکن ما 7 روز اعتبار دارد  
                        });
                    }
                    else
                    {
                        //--مشکل دریافت ریفرش توکن. باید دوباره لاگین کند  
                        RedirectToLogin(context);
                        return;
                    }
                }
                else
                {
                    // مدیریت عدم موفقیت در ریفرش توکن، مثلاً هدایت به صفحه لاگین  
                    RedirectToLogin(context);
                    return;
                }
            }
            else
            {
                // Refresh token is expired  
                RedirectToLogin(context);
                return;
            }
        }


        private async Task<string> RefreshTokenAsync(string refreshToken)
        {
            try
            {
                // منطق ریفرش توکن
                using (var client = new HttpClient())
                {
                    var content = new StringContent(JsonConvert.SerializeObject(new { token = refreshToken }), Encoding.UTF8, "application/json");
                    string uri = "https://sso.iran-europe.net/api/auth/refresh";
                    // آدرس اصلی در حالت غیر دیباگ
                    //#if DEBUG
                    //                string uri = "https://localhost:7100/api/auth/refresh"; // آدرس لوکال در حالت دیباگ
                    //#else
                    //                string uri = "https://sso.iran-europe.net/api/auth/refresh"; // آدرس اصلی در حالت غیر دیباگ
                    //#endif

                    var response = await client.PostAsync(uri, content);

                    if (response.IsSuccessStatusCode)
                    {
                        var newToken = await response.Content.ReadAsStringAsync();
                        return newToken;
                    }
                    else
                    {
                        return null;
                    }
                }
            }
            catch (Exception)
            {
                return null;
            }
        }

        private void RedirectToLogin(HttpContext context)
        {
            context.Response.Redirect("/Account/Login");
        }
    }
}
