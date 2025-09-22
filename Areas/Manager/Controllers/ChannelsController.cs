using Messenger.Tools;
using Messenger.WebApp.Models.ViewModels;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Messenger.WebApp.Areas.Manager.Controllers
{
    [Area("Manager")]
    [Authorize(Roles = ConstRoles.Manager)]
    public class ChannelsController : Controller
    {
        private readonly IChannelServiceClient _channelService;

        public ChannelsController(IChannelServiceClient channelService)
        {
            _channelService = channelService;
        }

        // GET: Channels
        public async Task<IActionResult> Index()
        {
            //TODO : در زمان اجرای واقعی باید کانالهایی را برگرداند که مربوط به این کاربر است
            // فرض می‌کنیم userId از احراز هویت در دسترس است
            // int userId = GetCurrentUserId(); // این متد باید پیاده‌سازی شود
            // var channels = await _channelService.GetChannelByIdAsync(userId);
            var channels = await _channelService.GetAllChannelAsync();
            return View(channels);
        }

        // GET: Channels/Create
        public IActionResult Create()
        {
            return View();
        }

        // POST: Channels/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(ChannelCreateViewModel model)
        {
            if (ModelState.IsValid)
            {
                try
                {
                    int userId = GetCurrentUserId();
                    var channel = await _channelService.CreateChannelAsync(userId, model.Name, model.Title);
                    return RedirectToAction(nameof(Index));
                }
                catch (Exception ex)
                {
                    ModelState.AddModelError("", $"Error creating channel: {ex.Message}");
                }
            }
            return View(model);
        }

        // GET: Channels/Details/5
        public async Task<IActionResult> Details(int id)
        {
            var channel = await _channelService.GetChannelByIdAsync(id);
            if (channel == null)
                return NotFound();

            var model = new ChannelDetailsViewModel
            {
                Id = channel.ChannelId,
                Name = channel.ChannelName,
                Title = channel.ChannelTitle,
                CreatorUserId = channel.CreatorUserId.Value,
                CreatedAt = channel.CreateDate
            };
            return View(model);
        }

        // GET: Channels/Edit/5
        public async Task<IActionResult> Edit(int id)
        {
            var channel = await _channelService.GetChannelByIdAsync(id);
            if (channel == null)
                return NotFound();

            var model = new ChannelEditViewModel
            {
                Id = channel.ChannelId,
                Name = channel.ChannelName,
                Title = channel.ChannelTitle
            };
            return View(model);
        }

        // POST: Channels/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, ChannelEditViewModel model)
        {
            if (id != model.Id)
                return BadRequest();

            if (ModelState.IsValid)
            {
                try
                {
                    await _channelService.UpdateChannelInfoAsync(id, model.Name, model.Title);
                    return RedirectToAction(nameof(Index));
                }
                catch (Exception ex)
                {
                    ModelState.AddModelError("", $"Error updating channel: {ex.Message}");
                }
            }
            return View(model);
        }

        // GET: Channels/Delete/5
        public async Task<IActionResult> Delete(int id)
        {
            var channel = await _channelService.GetChannelByIdAsync(id);
            if (channel == null)
                return NotFound();

            return View(channel);
        }

        // POST: Channels/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id)
        {
            try
            {
                await _channelService.DeleteChannelAsync(id);
                return RedirectToAction(nameof(Index));
            }
            catch (Exception ex)
            {
                ModelState.AddModelError("", $"Error deleting channel: {ex.Message}");
                var channel = await _channelService.GetChannelByIdAsync(id);
                return View(channel);
            }
        }

        // GET: Channels/Members/5
        public async Task<IActionResult> Members(int id)
        {
            var channel = await _channelService.GetChannelByIdAsync(id);
            if (channel == null)
                return NotFound();

            var members = await _channelService.GetChannelMembersAsync(id);
            var model = new ChannelMembersViewModel
            {
                ChannelId = id,
                ChannelName = channel.ChannelName,
                Members = members
            };
            return View(model);
        }

        // GET: Channels/AddMember/5
        public IActionResult AddMember(int id)
        {
            var model = new AddMemberToChannelViewModel { ChannelId = id };
            return View(model);
        }

        // POST: Channels/AddMember/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> AddMember(AddMemberToChannelViewModel model)
        {
            if (ModelState.IsValid)
            {
                try
                {
                    int addedByUserId = GetCurrentUserId();
                    await _channelService.AddUserToChannelAsync(model.ChannelId, model.UserIdToAdd, addedByUserId);
                    return RedirectToAction(nameof(Members), new { id = model.ChannelId });
                }
                catch (Exception ex)
                {
                    ModelState.AddModelError("", $"Error adding member: {ex.Message}");
                }
            }
            return View(model);
        }

        // GET: Channels/RemoveMember/5?userId=10
        public async Task<IActionResult> RemoveMember(int id, int userId)
        {
            var channel = await _channelService.GetChannelByIdAsync(id);
            if (channel == null)
                return NotFound();

            var isMember = await _channelService.IsUserMemberOfChannelAsync(userId, id);
            if (!isMember)
                return NotFound();

            var model = new RemoveMemberFromChannelViewModel
            {
                ChannelId = id,
                ChannelName = channel.ChannelName,
                UserIdToRemove = userId
            };
            return View(model);
        }

        // POST: Channels/RemoveMember/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> RemoveMember(RemoveMemberFromChannelViewModel model)
        {
            try
            {
                int removedByUserId = GetCurrentUserId();
                await _channelService.RemoveUserFromChannelAsync(model.ChannelId, model.UserIdToRemove, removedByUserId);
                return RedirectToAction(nameof(Members), new { id = model.ChannelId });
            }
            catch (Exception ex)
            {
                ModelState.AddModelError("", $"Error removing member: {ex.Message}");
                return View(model);
            }
        }

        // Helper method to get current user ID (implement based on your auth system)
        private int GetCurrentUserId()
        {
            // User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
            var userIdInClaim = User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
            if (userIdInClaim != null && int.TryParse(userIdInClaim, out int userId))
            {
                return userId;
            }
            return 0; // Should be handled by [Authorize] in API
        }
    }
}
