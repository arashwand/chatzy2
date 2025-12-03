using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Messenger.WebApp.ViewComponents
{
    public class MessageListViewComponent : ViewComponent
    {
        private readonly IMessageServiceClient _messageService;

        public MessageListViewComponent(IMessageServiceClient chatService)
        {
            _messageService = chatService;
        }

        //public async Task<IViewComponentResult> InvokeAsync(int groupId, int page = 1, int pageSize = 20, long messageId = 0)
        //{
        //    var messages = await _messageService.GetChatMessagesAsync(groupId, page, pageSize, messageId,false);
        //    return View(messages);
        //}

    }
}
