using Messenger.WebApp.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace Messenger.WebApp.Tools
{
    public class GetUserInfo
    {
        public UserInfoVM GetUserInfoFromToken(string token)
        {
            var handler = new JwtSecurityTokenHandler();
            var jwtToken = handler.ReadJwtToken(token);
            var name = jwtToken.Claims.First(c => c.Type == "NameFamily")?.Value;
            var roleName = jwtToken.Claims.First(c => c.Type == ClaimTypes.Role).Value;
            var userId = int.Parse(jwtToken.Claims.First(c => c.Type == ClaimTypes.NameIdentifier).Value);
            var portalRoleId = int.Parse(jwtToken.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value ?? "-1");
            var branchId = int.Parse(jwtToken.Claims.FirstOrDefault(c => c.Type == "BranchId")?.Value ?? "-1");
            var personelId = int.Parse(jwtToken.Claims.FirstOrDefault(c => c.Type == "PersonelId")?.Value ?? "-1");
            var teacherId = int.Parse(jwtToken.Claims.FirstOrDefault(c => c.Type == "TeacherId")?.Value ?? "-1");
            var studentId = int.Parse(jwtToken.Claims.FirstOrDefault(c => c.Type == "StudentId")?.Value ?? "-1");
            var mentorId = int.Parse(jwtToken.Claims.FirstOrDefault(c => c.Type == "MentorId")?.Value ?? "-1");

            var userModel = new UserInfoVM
            {
                accessToken = token,
                FullName = name,
                RoleName = roleName,
                RoleTitle = name,
                UserId = userId,
                PortalRoleId = portalRoleId,
                BranchId = branchId,
                MentorId = mentorId,
                PersonelId = personelId,
                StudentId = studentId,
                TeacherId = teacherId
            };

            return userModel;
        }
    }
}
