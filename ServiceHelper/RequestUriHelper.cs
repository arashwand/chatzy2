using System;
using Messenger.WebApp.Models;
using Microsoft.Extensions.Options;

namespace Messenger.WebApp.Helpers
{
    public class RequestUriHelper
    {
        private readonly JwtSettings _jwtSettings;

        public RequestUriHelper(IOptions<JwtSettings> jwtSettings)
        {
            _jwtSettings = jwtSettings.Value;
        }

        /// <summary>
        /// ادرس سرویس را میگیرد و با ادرس دامنه سرهم میکنه برمیگرداند
        /// </summary>
        /// <param name="uri"></param>
        /// <returns></returns>
        public Uri CreateRequestUri(string uri)
        {
            Uri baseUri = new Uri(_jwtSettings.Issuer);
            Uri requestUri = new Uri(baseUri, uri);
            return requestUri;
        }
    }
}
