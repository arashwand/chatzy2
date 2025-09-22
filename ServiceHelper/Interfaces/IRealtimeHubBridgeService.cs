using Messenger.DTOs;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Messenger.WebApp.ServiceHelper.Interfaces
{
    public interface IRealtimeHubBridgeService
    {
        bool IsConnected { get; }

        // Events
        event Func<object, Task> OnReceiveMessage;
        event Func<object, Task> OnReceiveEditedMessage;
        //event Func<object, Task> OnMessageReadByRecipient;
        //event Func<object, Task> OnMessageSuccessfullyMarkedAsRead;


        /// <summary>
        /// سرویس را به هاب API متصل می‌کند.
        /// </summary>
        /// <param name="token">توکن احراز هویت برای اتصال.</param>
        Task ConnectAsync(string token);

        /// <summary>
        /// اتصال از هاب API را قطع می‌کند.
        /// </summary>
        Task DisconnectAsync();

        /// <summary>
        /// ارسال به api جهت اینکه کاربر هنوز انلاین است
        /// </summary>
        /// <param name="userId"></param>
        /// <returns></returns>
        Task SendHeartbeatAsync(long userId);

        /// <summary>
        /// ارسال پیام از سمت کلاینت
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        Task SendMessageAsync(SendMessageRequestDto request);


        /// <summary>
        /// ویرایش و ارسال پیام از سمت کلاینت
        /// </summary>
        /// <param name="request"></param>
        /// <returns></returns>
        Task EditMessageAsync(EditMessageRequestDto request);


        /// <summary>
        /// سیگنال "در حال تایپ" را به هاب ارسال می‌کند.
        /// </summary>
        Task SendTypingSignalAsync(long userId, int groupId, string groupType);

        /// <summary>
        /// سیگنال "تایپ متوقف شد" را به هاب ارسال می‌کند.
        /// </summary>
        Task SendStopTypingSignalAsync(long userId, int groupId, string groupType);

        /// <summary>
        /// پیام را به عنوان "خوانده شده" علامت‌گذاری می‌کند.
        /// </summary>
        Task MarkMessageAsReadAsync(long userId, int groupId, string groupType, long messageId);

        /// <summary>
        /// پیام های یک گروه را برای یک کاربر به عنوان "خوانده شده" علامت‌گذاری می‌کند.
        /// </summary>
        Task MarkAllMessagesAsReadAsync(long userId, int groupId, string groupType);

        /// <summary>
        /// لیست کاربران آنلاین در یک گروه را از هاب دریافت می‌کند.
        /// </summary>
        Task<List<object>> GetUsersWithStatusAsync(string groupId, string groupType);

        /// <summary>
        /// حضور یک کاربر را به هاب اصلی اعلام می‌کند و در صورت نیاز، اتصال را برقرار می‌کند.
        /// </summary>
        /// <param name="token">توکن کاربر برای برقراری اتصال اولیه.</param>
        Task AnnounceUserPresenceAsync(long userId);

        /// <summary>
        /// خروج یک کاربر
        /// </summary>
        /// <param name="userId"></param>
        /// <returns></returns>
        Task AnnounceUserDepartureAsync(long userId);

    }
}