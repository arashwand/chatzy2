using Messenger.WebApp.Models.ViewModels;

namespace Messenger.WebApp.Services
{
    public interface IMessageService
    {
        Task<InitialChatDataViewModel> GetInitialChatDataAsync(InitialChatDataRequest request, long userId);
    }
}
