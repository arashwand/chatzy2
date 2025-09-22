namespace Messenger.WebApp.RequestDTOs
{
    public record UpdateClassGroupRequest(string LevelName, string ClassTiming, bool IsActive, int LeftSes, DateTime EndDate);
}
