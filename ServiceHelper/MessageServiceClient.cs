using Messenger.DTOs;
using Messenger.WebApp.ServiceHelper.Interfaces;
using Messenger.WebApp.ServiceHelper.RequestDTOs;

namespace Messenger.WebApp.ServiceHelper
{
    public class MessageServiceClient : IMessageServiceClient
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<MessageServiceClient> _logger;

        public MessageServiceClient(IHttpClientFactory httpClientFactory, string serviceName, ILogger<MessageServiceClient> logger)
        {
            _httpClient = httpClientFactory.CreateClient(serviceName);
            _logger = logger;
        }

        public async Task<MessageDto> SendPrivateMessageAsync(long receiverUserId, string messageText, List<long>? fileAttachementIds = null, long? replyToMessageId = null)
        {
            var request = new { ReceiverUserId = receiverUserId, MessageText = messageText, FileAttachementIds = fileAttachementIds, ReplyToMessageId = replyToMessageId };
            var response = await _httpClient.PostAsJsonAsync("api/messages/private", request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<MessageDto>();
        }

        public async Task<MessageDto> SendChannelMessageAsync(long channelId, string messageText, List<long>? fileAttachementIds = null, long? replyToMessageId = null)
        {
            var request = new { ChannelId = channelId, MessageText = messageText, FileAttachementIds = fileAttachementIds, ReplyToMessageId = replyToMessageId };
            var response = await _httpClient.PostAsJsonAsync("api/messages/channel", request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<MessageDto>();
        }

        public async Task<MessageDto> SendClassGroupMessageAsync(int classId, string messageText, List<long>? fileAttachementIds = null, long? replyToMessageId = null)
        {
            var request = new { ClassId = classId, MessageText = messageText, FileAttachementIds = fileAttachementIds, ReplyToMessageId = replyToMessageId };
            var response = await _httpClient.PostAsJsonAsync("api/messages/classgroup", request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<MessageDto>();
        }

        public async Task<MessageDto?> GetMessageByIdAsync(long messageId)
        {
            return await _httpClient.GetFromJsonAsync<MessageDto>($"api/messages/{messageId}");
        }

        public async Task<IEnumerable<MessageDto>> GetPrivateMessagesAsync(long userId1, long userId2, int pageNumber, int pageSize, long messageId, bool loadOlder)
        {
            var response = await _httpClient.GetFromJsonAsync<IEnumerable<MessageDto>>(
                $"api/messages/private?userId1={userId1}&userId2={userId2}&pageNumber={pageNumber}&pageSize={pageSize}");
            return response ?? new List<MessageDto>();
        }

        public async Task<IEnumerable<MessageDto>> GetChannelMessagesAsync(int channelId, int pageNumber, int pageSize, long messageId, bool loadOlder)
        {
            var response = await _httpClient.GetFromJsonAsync<IEnumerable<MessageDto>>(
                $"api/messages/channel/{channelId}?pageNumber={pageNumber}&pageSize={pageSize}");
            // currentUserId is not sent in the query string as the API gets it from claims
            return response ?? new List<MessageDto>();
        }

        public async Task<IEnumerable<MessageDto>> GetClassGroupMessagesAsync(int classId, int pageNumber, int pageSize, long messageId, bool loadOlder)
        {
            try
            {
                var response = await _httpClient.GetAsync(
                $"api/messages/classgroup/{classId}?pageNumber={pageNumber}&pageSize={pageSize}&messageId={messageId}&loadOlder={loadOlder}");
                response.EnsureSuccessStatusCode();
                return await response.Content.ReadFromJsonAsync<IEnumerable<MessageDto>>() ?? new List<MessageDto>();
            }
            catch (HttpRequestException httpEx)
            {
                _logger.LogError(httpEx, "HTTP error fetching class group messages for classId {classId}: {statusCode} {reason}", classId, httpEx.StatusCode, httpEx.Message);
                throw;
            }
            catch (System.Text.Json.JsonException jsonEx)
            {
                _logger.LogError(jsonEx, "JSON deserialization error for class group messages classId {classId}", classId);
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching class group messages for classId {classId}", classId);
                throw;
            }
        }


        public async Task<IEnumerable<MessageDto>> GetChatPinnedMessagesAsync(int classId, string chatType, int pageSize)
        {
            try
            {
                var response = await _httpClient.GetAsync(
                $"api/messages/chatpinned/{classId}?chatType={chatType}&pageSize={pageSize}");
                response.EnsureSuccessStatusCode();
                return await response.Content.ReadFromJsonAsync<IEnumerable<MessageDto>>() ?? new List<MessageDto>();
            }
            catch (HttpRequestException httpEx)
            {
                _logger.LogError(httpEx, "HTTP error fetching class group messages for classId {classId}: {statusCode} {reason}", classId, httpEx.StatusCode, httpEx.Message);
                throw;
            }
            catch (System.Text.Json.JsonException jsonEx)
            {
                _logger.LogError(jsonEx, "JSON deserialization error for class group messages classId {classId}", classId);
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching class group messages for classId {classId}", classId);
                throw;
            }
        }

        public async Task<long?> MarkMessageAsReadAsync(long messageId, long userId) // userId is kept for interface consistency, though not sent in this POST.
        {
            // The API endpoint is POST api/Messages/{messageId}/read and takes messageId from URL, userId from JWT.
            // It does not expect a request body.
            var requestUri = $"api/Messages/{messageId}/read";

            try
            {
                // Send POST request without a body.
                HttpContent? content = null;

                HttpResponseMessage response = await _httpClient.PostAsync(requestUri, content);

                if (response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == System.Net.HttpStatusCode.OK) // Expects Ok(new { senderId = ...})
                    {
                        try
                        {
                            var result = await response.Content.ReadFromJsonAsync<SenderIdResponse>(); // Define SenderIdResponse below
                            return result?.senderId;
                        }
                        catch (System.Text.Json.JsonException jsonEx)
                        {
                            _logger.LogError(jsonEx, "Error deserializing senderId from MarkMessageAsReadAsync response for message {messageId}. Response: {responseContent}", messageId, await response.Content.ReadAsStringAsync());
                            return null;
                        }
                    }
                    else if (response.StatusCode == System.Net.HttpStatusCode.NoContent) // Should not happen based on controller change
                    {
                        _logger.LogWarning("MarkMessageAsReadAsync for message {messageId} returned NoContent. Expected OK with senderId.", messageId);
                        return null;
                    }
                    _logger.LogWarning("MarkMessageAsReadAsync for message {messageId} returned unexpected success status: {statusCode}", messageId, response.StatusCode);
                    return null; // Or throw, depending on desired error handling
                }
                else if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    _logger.LogWarning("MarkMessageAsReadAsync for message {messageId} returned NotFound.", messageId);
                    return null;
                }
                else
                {
                    _logger.LogError("Error marking message {messageId} as read. Status: {statusCode}, Reason: {reasonPhrase}", messageId, response.StatusCode, response.ReasonPhrase);
                    // Consider throwing an exception or returning a specific error indicator if needed.
                    // For now, returning null for any non-success scenario other than specific handling.
                    return null;
                }
            }
            catch (HttpRequestException httpEx)
            {
                _logger.LogError(httpEx, "HTTP request error marking message {messageId} as read.", messageId);
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Generic error marking message {messageId} as read.", messageId);
                return null;
            }
        }

        // Helper class for deserialization
        private class SenderIdResponse
        {
            public long? senderId { get; set; }
        }

        public async Task<IEnumerable<MessageReadDto>> GetMessageReadStatusAsync(long messageId)
        {
            var response = await _httpClient.GetFromJsonAsync<IEnumerable<MessageReadDto>>($"api/messages/{messageId}/readstatus");
            return response ?? new List<MessageReadDto>();
        }

        public async Task PinMessageAsync(long messageId, bool isPinned)
        {
            var request = new { MessageId = messageId, IsPinned = isPinned };
            var response = await _httpClient.PostAsJsonAsync("api/messages/pin", request);
            response.EnsureSuccessStatusCode();
        }

        public async Task DeleteMessageAsync(DeleteMessageRequestDto deleteMessageRequestModel)
        {
            try
            {
                var request = new { messageId = deleteMessageRequestModel.MessageId, groupId = deleteMessageRequestModel.GroupId, grouptype = deleteMessageRequestModel.GroupType };
                var response = await _httpClient.PostAsJsonAsync($"api/messages/hide", request);
                response.EnsureSuccessStatusCode();
            }
            catch (Exception ex)
            {
                throw;
            }
        }

        public async Task<MessageFoulReportDto> ReportMessageAsync(long messageId, long reporterUserId, string reason)
        {
            var request = new { MessageId = messageId, ReporterUserId = reporterUserId, Reason = reason };
            var response = await _httpClient.PostAsJsonAsync("api/messages/report", request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<MessageFoulReportDto>();
        }

        public async Task SaveMessageAsync(long messageId)
        {
            // var request = new { messageId = messageId };
            var response = await _httpClient.PostAsJsonAsync($"api/messages/{messageId}/save", 0);
            response.EnsureSuccessStatusCode();
        }

        public async Task<IEnumerable<MessageSavedDto>> GetSavedMessagesAsync()
        {
            var response = await _httpClient.GetFromJsonAsync<IEnumerable<MessageSavedDto>>($"api/messages/saved");
            return response ?? new List<MessageSavedDto>();
        }

        public async Task DeleteSavedMessageAsync(long messageSavedId)
        {
            var response = await _httpClient.DeleteAsync($"api/messages/saved/{messageSavedId}");
            response.EnsureSuccessStatusCode();
        }

        public async Task<MessageDto> SendPrivateFileMessageAsync(long senderUserId, long receiverUserId, string fileName, byte[] fileContent, string contentType, long fileSize)
        {
            using var content = new MultipartFormDataContent();
            content.Add(new StringContent(senderUserId.ToString()), "SenderUserId");
            content.Add(new StringContent(receiverUserId.ToString()), "ReceiverUserId");
            content.Add(new StringContent(fileName), "FileName");
            content.Add(new ByteArrayContent(fileContent), "FileContent", fileName);
            content.Add(new StringContent(contentType), "ContentType");
            content.Add(new StringContent(fileSize.ToString()), "FileSize");

            var response = await _httpClient.PostAsync("api/messages/private/file", content);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<MessageDto>();
        }

        public async Task<MessageDto> SendChannelFileMessageAsync(long senderUserId, int channelId, string fileName, byte[] fileContent, string contentType, long fileSize)
        {
            using var content = new MultipartFormDataContent();
            content.Add(new StringContent(senderUserId.ToString()), "SenderUserId");
            content.Add(new StringContent(channelId.ToString()), "ChannelId");
            content.Add(new StringContent(fileName), "FileName");
            content.Add(new ByteArrayContent(fileContent), "FileContent", fileName);
            content.Add(new StringContent(contentType), "ContentType");
            content.Add(new StringContent(fileSize.ToString()), "FileSize");

            var response = await _httpClient.PostAsync("api/messages/channel/file", content);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<MessageDto>();
        }

        public async Task<MessageDto> SendClassGroupFileMessageAsync(long senderUserId, int classId, string fileName, byte[] fileContent, string contentType, long fileSize)
        {
            using var content = new MultipartFormDataContent();
            content.Add(new StringContent(senderUserId.ToString()), "SenderUserId");
            content.Add(new StringContent(classId.ToString()), "ClassId");
            content.Add(new StringContent(fileName), "FileName");
            content.Add(new ByteArrayContent(fileContent), "FileContent", fileName);
            content.Add(new StringContent(contentType), "ContentType");
            content.Add(new StringContent(fileSize.ToString()), "FileSize");

            var response = await _httpClient.PostAsync("api/messages/classgroup/file", content);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<MessageDto>();
        }

        //edit
        public async Task<MessageDto> EditMessageAsync(long messageId, int groupId, string groupType, string newText, List<long>? fileIds, List<long>? fileIdsToRemove)
        {
            var request = new { MessageId = messageId, GroupId = groupId, GroupType = groupType, MessageText = newText, FileAttachementIds = fileIds, FileIdsToRemove = fileIdsToRemove };
            var response = await _httpClient.PutAsJsonAsync("api/messages/classgroup", request);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<MessageDto>();
        }

        //public async Task<MessageDto> EditChannelMessageAsync(long messageId, string newText, List<long>? fileIds, List<long>? fileIdsToRemove)
        //{
        //    var request = new {MessageId = messageId, MessageText = newText, FileAttachementIds = fileIds, FileIdsToRemove = fileIdsToRemove };
        //    var response = await _httpClient.PutAsJsonAsync("api/messages/channel", request);
        //    response.EnsureSuccessStatusCode();
        //    return await response.Content.ReadFromJsonAsync<MessageDto>();
        //}
    }
}
