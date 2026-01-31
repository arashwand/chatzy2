using Messenger.DTOs;
using Messenger.Tools;
using Messenger.WebApp.Models.ViewModels;
using Messenger.WebApp.ServiceHelper;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Messenger.WebApp.Areas.Manager.Controllers
{
    [Area("Manager")]
    [Authorize(Roles = ConstRoles.Manager)]
    public class ClassGroupsController : Controller
    {
        private readonly IClassGroupServiceClient _classGroupService;

        public ClassGroupsController(IClassGroupServiceClient classGroupService)
        {
            _classGroupService = classGroupService;
        }

        // GET: ClassGroups
        public async Task<IActionResult> Index()
        {
            try
            {
                //int userId = GetCurrentUserId();
                var classGroups = await _classGroupService.GetAllClassGroupsAsync();
                return View(classGroups);
            }
            catch (UnauthorizedAccessException ex)
            {
                return RedirectToAction("Login", "Account"); // Redirect to login page
            }
            catch (InvalidOperationException ex)
            {
                TempData["Error"] = ex.Message;
                return View(new List<ClassGroupDto>());
            }
            catch (Exception ex)
            {
                TempData["Error"] = "خطای غیرمنتظره‌ای رخ داد. لطفاً بعداً تلاش کنید.";
                return View(new List<ClassGroupDto>());
            }
        }


        /// <summary>
        /// در این اکشن از سرویس بدست اوردی ایدی اساتید استفاده کردیم
        /// که فقط نقش مدیر این قابلیت را دارد
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        // GET: ClassGroups/Taught
        public async Task<IActionResult> Taught(long id)
        {
            //long userId = GetCurrentUserId();
            var classGroups = await _classGroupService.GetTeacherTaughtClassGroupsAsync(id);
            return View(classGroups);
        }
        
        /// <summary>
        /// نمایش گروههایی که کاربر در انها قرار دارد
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        public async Task<IActionResult> ShowUserClassGroups(long id)
        {
            //long userId = GetCurrentUserId();
            var classGroups = await _classGroupService.ShowUserClassGroupsAsync(id);
            return View(classGroups);
        }

        // GET: ClassGroups/Create
        public IActionResult Create()
        {
            return View();
        }

        // POST: ClassGroups/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(ClassGroupDto model)
        {
            if (ModelState.IsValid)
            {
                try
                {
                    long userId = GetCurrentUserId();
                    var classGroup = await _classGroupService.CreateClassGroupAsync( model);
                    return RedirectToAction(nameof(Index));
                }
                catch (Exception ex)
                {
                    ModelState.AddModelError("", $"Error creating class group: {ex.Message}");
                }
            }
            return View(model);
        }

        // GET: ClassGroups/Details/5
        public async Task<IActionResult> Details(int id)
        {
            var classGroup = await _classGroupService.GetClassGroupByIdAsync(id);
            if (classGroup == null)
                return NotFound();

            var model = new ClassGroupDto
            {
                ClassId = classGroup.ClassId,
                LevelName = classGroup.LevelName,
                ClassTiming = classGroup.ClassTiming,
                IsActive = classGroup.IsActive,
                LeftSes = classGroup.LeftSes,
                EndDate = classGroup.EndDate,
                TeacherUserId = classGroup.TeacherUserId,
                //CreatedAt = classGroup.
            };
            return View(model);
        }

        // GET: ClassGroups/Edit/5
        public async Task<IActionResult> Edit(int id)
        {
            var classGroup = await _classGroupService.GetClassGroupByIdAsync(id);
            if (classGroup == null)
                return NotFound();

            var model = new ClassGroupDto
            {
                ClassId = classGroup.ClassId,
                TeacherUserId = classGroup.TeacherUserId,
                LevelName = classGroup.LevelName,
                ClassTiming = classGroup.ClassTiming,
                IsActive = classGroup.IsActive,
                LeftSes = classGroup.LeftSes,
                EndDate = classGroup.EndDate
            };
            return View(model);
        }

        // POST: ClassGroups/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, ClassGroupDto model)
        {
            if (id != model.ClassId)
                return BadRequest();

            if (ModelState.IsValid)
            {
                try
                {
                    await _classGroupService.UpdateClassGroupInfoAsync(model);
                    return RedirectToAction(nameof(Index));
                }
                catch (Exception ex)
                {
                    ModelState.AddModelError("", $"Error updating class group: {ex.Message}");
                }
            }
            return View(model);
        }

        // GET: ClassGroups/Delete/5
        public async Task<IActionResult> Delete(int id)
        {
            var classGroup = await _classGroupService.GetClassGroupByIdAsync(id);
            if (classGroup == null)
                return NotFound();

            return View(classGroup);
        }

        // POST: ClassGroups/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(int id)
        {
            try
            {
                await _classGroupService.DeleteClassGroupAsync(id);
                return RedirectToAction(nameof(Index));
            }
            catch (Exception ex)
            {
                ModelState.AddModelError("", $"Error deleting class group: {ex.Message}");
                var classGroup = await _classGroupService.GetClassGroupByIdAsync(id);
                return View(classGroup);
            }
        }

        // GET: ClassGroups/Members/5
        public async Task<IActionResult> Members(int id)
        {
            var classGroup = await _classGroupService.GetClassGroupByIdAsync(id);
            if (classGroup == null)
                return NotFound();

            var members = await _classGroupService.GetClassGroupMembersAsync(id);
            var model = new ClassGroupMembersViewModel
            {
                ClassId = id,
                LevelName = classGroup.LevelName,
                Members = members
            };
            return View(model);
        }

        // GET: ClassGroups/AddMember/5
        public IActionResult AddMember(int id)
        {
            var model = new AddMemberToGoupViewModel { ClassId = id };
            return View(model);
        }

        // POST: ClassGroups/AddMember/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> AddMember(AddMemberToGoupViewModel model)
        {
            if (ModelState.IsValid)
            {
                try
                {
                    long addedByUserId = GetCurrentUserId();
                    await _classGroupService.AddUserToClassGroupAsync(model.ClassId, model.UserIdToAdd, addedByUserId);
                    return RedirectToAction(nameof(Members), new { id = model.ClassId });
                }
                catch (Exception ex)
                {
                    ModelState.AddModelError("", $"Error adding member: {ex.Message}");
                }
            }
            return View(model);
        }

        // GET: ClassGroups/RemoveMember/5?userId=10
        public async Task<IActionResult> RemoveMember(int id, int userId)
        {
            var classGroup = await _classGroupService.GetClassGroupByIdAsync(id);
            if (classGroup == null)
                return NotFound();

            var model = new RemoveMemberFromGroupViewModel
            {
                ClassId = id,
                LevelName = classGroup.LevelName,
                UserIdToRemove = userId
            };
            return View(model);
        }

        // POST: ClassGroups/RemoveMember/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> RemoveMember(RemoveMemberFromGroupViewModel model)
        {
            try
            {
                long removedByUserId = GetCurrentUserId();
                await _classGroupService.RemoveUserFromClassGroupAsync(model.ClassId, model.UserIdToRemove, removedByUserId);
                return RedirectToAction(nameof(Members), new { id = model.ClassId });
            }
            catch (Exception ex)
            {
                ModelState.AddModelError("", $"Error removing member: {ex.Message}");
                return View(model);
            }
        }

        // Helper method to get current user ID
        private long GetCurrentUserId()
        {
           // User.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;
            var userIdInClaim = User.Claims.FirstOrDefault(c=> c.Type == "UserId")?.Value;
            if (userIdInClaim != null && long.TryParse(userIdInClaim, out long userId))
            {
                return userId;
            }
            return 0; // Should be handled by [Authorize] in API
        }
    }
}
