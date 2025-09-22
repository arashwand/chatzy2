using Messenger.Tools;
using Microsoft.AspNetCore.Mvc.Rendering;

namespace Messenger.WebApp
{
    public class SD_RoleName
    {
        
        public static IEnumerable<SelectListItem> GetListOfRoles()
        {
            return ConstRoles.ListRoles().Select(x => new SelectListItem
            {
                Text = x,
                Value = x
            }).ToList();
        }


    }

}
