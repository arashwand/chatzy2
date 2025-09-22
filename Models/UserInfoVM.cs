using System.ComponentModel.DataAnnotations;

namespace Messenger.WebApp.Models
{
    public class UserInfoVM
    {
        public string? FullName { get; set; }
        public string? RoleName { get; set; }
        public string? RoleTitle { get; set; }
        public int UserId { get; set; }
        public int PortalRoleId { get; set; }
        public string accessToken { get; set; }
        public int BranchId { get; set; }
        public int PersonelId { get; set; } = -1;
        public int TeacherId { get; set; } = -1;
        public int StudentId { get; set; } = -1;
        public int MentorId { get; set; } = -1;
    }

   

public class CreateUserRequest
    {
        [Required(ErrorMessage = "LoginCode is required.")]
        public string LoginCode { get; set; } = null!;

        [Required(ErrorMessage = "Password is required.")]
        public string Password { get; set; } = null!;

        public int UserId { get; set; }
        public int BranchId { get; set; }
        public int? PersonelId { get; set; } = -1;
        public int? TeacherId { get; set; } = -1;
        public int? StudentId { get; set; } = -1;
        public int? MentorId { get; set; } = -1;
        public string? RoleName { get; set; } = "";

        public int PortalRoleId { get; set; } = 4;
        public bool IsActive { get; set; } = true;
    }
}
