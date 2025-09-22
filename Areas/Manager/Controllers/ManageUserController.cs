using Messenger.DTOs;
using Messenger.Tools;
using Messenger.WebApp.Models;
using Messenger.WebApp.Models.ViewModels;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Reflection;
using WebAppTest_SSO.Controllers;

namespace Messenger.WebApp.Areas.Manager.Controllers
{
    [Area("Manager")]
    [Authorize(Roles = ConstRoles.Manager)]
    public class ManageUserController : Controller
    {
        private readonly IUserServiceClient _manageUserServiceClientClient;
        private readonly IManageUserServiceClient _manageUserServiceClient;
        private readonly ILogger<ManageUserController> _logger;

        public ManageUserController(IUserServiceClient userServiceClient,
            ILogger<ManageUserController> logger,
            IManageUserServiceClient manageUserServiceClient)
        {
            _logger = logger;
            _manageUserServiceClientClient = userServiceClient;
            _manageUserServiceClient = manageUserServiceClient;
        }

        // GET: ManageUsers
        public async Task<IActionResult> Index()
        {
            //var users = await _manageUserServiceClient.GetAllUsersAsync();
            //return View(users);
            try
            {
                var users = await _manageUserServiceClient.GetAllUsersAsync();
                return View(users);
            }
            catch (UnauthorizedAccessException ex)
            {
                return RedirectToAction("Login", "Account"); // Redirect to login page
            }
            catch (InvalidOperationException ex)
            {
                TempData["Error"] = ex.Message;
                return View(new List<UserDto>());
            }
            catch (Exception ex)
            {
                TempData["Error"] = "خطای غیرمنتظره‌ای رخ داد. لطفاً بعداً تلاش کنید.";
                return View(new List<UserDto>());
            }
        }


        // GET: ManageUsers/Details/5
        public async Task<IActionResult> Details(long id)
        {
            try
            {
                var user = await _manageUserServiceClient.GetUserByIdAsync(id);
                var model = new UserDto
                {
                    UserId = user.UserId,
                    NameFamily = user.NameFamily,
                    RoleName = user.RoleName,
                    DeptName = user.DeptName,
                    ProfilePicName = user.ProfilePicName,
                    RoleFaName = user.RoleFaName
                };
                return View(model);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { ex.Message });
            }
        }

        // GET: ManageUsers/Create
        public IActionResult Create()
        {
            return View();
        }

        // POST: ManageUsers/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(UserDto model)
        {
            if (ModelState.IsValid)
            {
                try
                {
                    var userDto = new UserDto
                    {
                        UserId = model.UserId,
                        NameFamily = model.NameFamily,
                        RoleName = model.RoleName,
                        DeptName = model.DeptName,
                        ProfilePicName = model.ProfilePicName,
                        RoleFaName = RoleFaName.GetRoleName(model.RoleName)
                    };
                    await _manageUserServiceClient.CreateUserAsync(userDto);
                    return RedirectToAction(nameof(Index));
                }
                catch (InvalidOperationException ex)
                {
                    ModelState.AddModelError("", ex.Message);
                }
            }
            return View(model);
        }

        // GET: ManageUsers/Edit/5
        public async Task<IActionResult> Edit(long id)
        {
            try
            {
                var user = await _manageUserServiceClient.GetUserByIdAsync(id);
                var model = new UserDto
                {
                    UserId = user.UserId,
                    NameFamily = user.NameFamily,
                    RoleName = user.RoleName,
                    RoleFaName = user.RoleFaName,
                    DeptName = user.DeptName,
                    ProfilePicName = user.ProfilePicName,
                };
                return View(model);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { ex.Message });
            }
        }

        // POST: ManageUsers/Edit/5
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(long id, UserDto model)
        {
            if (id != model.UserId)
                return BadRequest();

            if (ModelState.IsValid)
            {
                try
                {
                    await _manageUserServiceClient.UpdateUserAsync(model);
                    return RedirectToAction(nameof(Index));
                }
                catch (KeyNotFoundException ex)
                {
                    ModelState.AddModelError("", ex.Message);
                }
                catch (InvalidOperationException ex)
                {
                    ModelState.AddModelError("", ex.Message);
                }
            }
            return View(model);
        }

        // GET: ManageUsers/Delete/5
        public async Task<IActionResult> Delete(long id)
        {
            try
            {
                var user = await _manageUserServiceClient.GetUserByIdAsync(id);
                return View(user);
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { ex.Message });
            }
        }

        // POST: ManageUsers/Delete/5
        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> DeleteConfirmed(long id)
        {
            try
            {
                await _manageUserServiceClient.DeleteUserAsync(id);
                return RedirectToAction(nameof(Index));
            }
            catch (KeyNotFoundException ex)
            {
                ModelState.AddModelError("", ex.Message);
                var user = await _manageUserServiceClient.GetUserByIdAsync(id);
                return View(user);
            }
        }
    }
}
