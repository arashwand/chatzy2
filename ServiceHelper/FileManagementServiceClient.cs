using Azure;
using Messenger.DTOs;
using Messenger.WebApp.Models.ViewModels;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Messenger.WebApp.ServiceHelper
{
    public class FileManagementServiceClient : IFileManagementServiceClient
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<FileManagementServiceClient> _logger;

        public FileManagementServiceClient(IHttpClientFactory httpClientFactory, string serviceName, ILogger<FileManagementServiceClient> logger)
        {
            _httpClient = httpClientFactory.CreateClient(serviceName);
            _logger = logger;
        }

        /// <summary>
        /// فایلی را به وب سرویس آپلود فایل سرور ارسال می‌کند.
        /// </summary>
        /// <param name="fileStream">استریم فایل مورد نظر.</param>
        /// <param name="fileName">نام فایل.</param>
        /// <param name="contentType">نوع MIME فایل (e.g., "image/jpeg").</param>
        /// <returns>یک DTO شامل شناسه فایل آپلود شده.</returns>
        public async Task<long> UploadFileAsync(Stream fileStream, string fileName, string contentType)
        {
            using var content = new MultipartFormDataContent();
            var fileContent = new StreamContent(fileStream);
            fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
            content.Add(fileContent, "file", fileName);

            var requestUri = "api/filemanagement/upload";
            var response = await _httpClient.PostAsync(requestUri, content);

            // در صورت بروز خطا، یک Exception پرتاب می‌شود
            response.EnsureSuccessStatusCode();

            try
            {
                // خواندن و تبدیل مستقیم پاسخ JSON به کلاس مورد نظر
                // این متد در صورت عدم تطابق ساختار، null یا یک استثناء برمی‌گرداند
                var result = await response.Content.ReadFromJsonAsync<FileIdentifierDto>();
                return result.FileId;
            }
            catch (JsonException jsonEx)
            {
                // اگر تبدیل JSON با خطا مواجه شد، متن اصلی پاسخ را برای دیباگ بخوان
                var responseBodyForDebugging = await response.Content.ReadAsStringAsync();
                // این خطا را باید در سیستم لاگ خود ثبت کنید تا بتوانید ساختار پاسخ اشتباه را بررسی کنید
                // مثلاً: _logger.LogError(jsonEx, "Failed to deserialize response. Body: {ResponseBody}", responseBodyForDebugging);

                // یک استثناء جدید با پیام واضح‌تر پرتاب کن
                throw new InvalidOperationException($"پاسخ دریافت شده از سرویس آپلود قابل پردازش نیست. متن پاسخ: {responseBodyForDebugging}", jsonEx);
            }
            //return await response.Content.ReadFromJsonAsync<FileUploadedId>();
        }

        public async Task<FileInfoResult> GetFileInfoAsync(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                throw new ArgumentException("File path cannot be empty.", nameof(filePath));

            var response = await _httpClient.GetFromJsonAsync<FileInfoResult>($"api/filemanagement/info?filePath={Uri.EscapeDataString(filePath)}");
            return response ?? throw new InvalidOperationException("Failed to retrieve file info.");
        }

        public async Task<FileDownloadResult> DownloadFileAsync(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                throw new ArgumentException("File path cannot be empty.", nameof(filePath));

            var response = await _httpClient.GetAsync($"api/filemanagement/download?filePath={Uri.EscapeDataString(filePath)}");
            response.EnsureSuccessStatusCode();

            var fileBytes = await response.Content.ReadAsByteArrayAsync();
            var contentDisposition = response.Content.Headers.ContentDisposition?.FileNameStar ?? response.Content.Headers.ContentDisposition?.FileName;
            var fileName = contentDisposition ?? Path.GetFileName(filePath);
            var mimeType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";

            return new FileDownloadResult
            {
                FileBytes = fileBytes,
                FileName = fileName,
                MimeType = mimeType
            };
        }


        public async Task<FileDownloadData?> GetFileDataAsync(long messageFileId)
        {
            if (messageFileId <= 0)
                throw new ArgumentException("File path cannot be empty.", nameof(messageFileId));

            var response = await _httpClient.GetAsync($"api/filemanagement/download?messageFileId={messageFileId}");
            response.EnsureSuccessStatusCode();

            var fileBytes = await response.Content.ReadAsByteArrayAsync();
            var contentDisposition = response.Content.Headers.ContentDisposition?.FileNameStar ?? response.Content.Headers.ContentDisposition?.FileName;
            var fileName = contentDisposition;
            var mimeType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";

            var result = new FileDownloadData
            (
                 fileBytes,
                 mimeType,
                 fileName
            );
            return result;
        }

        public async Task DeleteFileAsync(long fileId)
        {
            if (fileId <= 0)
                throw new ArgumentException("File path cannot be empty.", nameof(fileId));

            var response = await _httpClient.DeleteAsync($"api/filemanagement/delete?fileId={fileId}");
            response.EnsureSuccessStatusCode();
        }

        public async Task<IEnumerable<FileListItem>> ListFilesAsync(string subDirectory = null)
        {
            var requestUri = string.IsNullOrEmpty(subDirectory) ? "api/filemanagement/list" : $"api/filemanagement/list?subDirectory={Uri.EscapeDataString(subDirectory)}";
            var response = await _httpClient.GetFromJsonAsync<IEnumerable<FileListItem>>(requestUri);
            return response ?? new List<FileListItem>();
        }

        public async Task<FileRenameResult> RenameFileAsync(string filePath, string newFileName)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                throw new ArgumentException("File path cannot be empty.", nameof(filePath));
            if (string.IsNullOrWhiteSpace(newFileName))
                throw new ArgumentException("New file name cannot be empty.", nameof(newFileName));

            var response = await _httpClient.PutAsJsonAsync(
                $"api/filemanagement/rename?filePath={Uri.EscapeDataString(filePath)}&newFileName={Uri.EscapeDataString(newFileName)}",
                new { });
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<FileRenameResult>();
        }

        public async Task<FileCountsDto> GetFileCountsForChatAsync(int chatId, string groupType)
        {
            var result =  new FileCountsDto()
            {
                DocumentCount=1,
                MediaCount = 2,
                LinkCount = 3
            };
            return result;
        }
    }
}
