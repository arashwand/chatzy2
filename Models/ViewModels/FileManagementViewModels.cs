namespace Messenger.WebApp.Models.ViewModels
{
    // DTO classes for responses
    //public class FileUploadedId
    //{
    //    public long FileIdentifierDto { get; set; }
    //}

    public class FileUploadResult
    {
        public string FilePath { get; set; }
        public string FileName { get; set; }
        public long FileSize { get; set; }
        public DateTime CreatedDate { get; set; }
        public DateTime ModifiedDate { get; set; }
        public string MimeType { get; set; }
    }

    public class FileInfoResult
    {
        public string FilePath { get; set; }
        public string FullPath { get; set; }
        public string FileName { get; set; }
        public long FileSize { get; set; }
        public DateTime CreatedDate { get; set; }
        public DateTime ModifiedDate { get; set; }
        public string MimeType { get; set; }
    }

    public class FileDownloadResult
    {
        public byte[] FileBytes { get; set; }
        public string FileName { get; set; }
        public string MimeType { get; set; }
    }

    public class FileListItem
    {
        public string FileName { get; set; }
        public long FileSize { get; set; }
        public DateTime CreatedDate { get; set; }
        public DateTime ModifiedDate { get; set; }
        public string MimeType { get; set; }
    }

    public class FileRenameResult
    {
        public string OldPath { get; set; }
        public string NewPath { get; set; }
        public string Message { get; set; }
    }
}
