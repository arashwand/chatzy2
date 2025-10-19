using Messenger.DTOs;
using Messenger.WebApp.Models.ViewModels;

namespace Messenger.WebApp.ServiceHelper.Interfaces
{
    public interface IFileManagementServiceClient
    {
        Task<long> UploadFileAsync(Stream fileStream, string fileName, string contentType);
        Task<FileInfoResult> GetFileInfoAsync(string filePath);

        /// <summary>
        /// جهت دانلود فایل
        /// </summary>
        /// <param name="filePath"></param>
        /// <returns></returns>
        Task<FileDownloadResult> DownloadFileAsync(string filePath);

        /// <summary>
        /// جهت استفاده فایل هایی که میخواهیم در بدنه مرورگر نمایش یا اجرا کنیم
        /// </summary>
        /// <param name="messageFileId"></param>
        /// <returns></returns>
        Task<FileDownloadData?> GetFileDataAsync(long messageFileId);

        Task DeleteFileAsync(long fileId);
        Task<IEnumerable<FileListItem>> ListFilesAsync(string subDirectory = null);
        Task<FileRenameResult> RenameFileAsync(string filePath, string newFileName);

        Task<FileCountsDto> GetFileCountsForChatAsync(int chatId, string groupType);

    }
}
