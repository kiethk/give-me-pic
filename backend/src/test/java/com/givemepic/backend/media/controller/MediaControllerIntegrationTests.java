package com.givemepic.backend.media.controller;

import com.givemepic.backend.billing.service.BillingPlan;
import com.givemepic.backend.media.storage.ObjectStorageService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class MediaControllerIntegrationTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoSpyBean
    private ObjectStorageService objectStorageService;

    @Test
    void mediaRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/media"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void authenticatedUserCanUploadMediaToSubject() throws Exception {
        Cookie accessCookie = registerUserAndGetAccessCookie();
        String subjectId = createSubject(accessCookie);

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "sample.png",
                MediaType.IMAGE_PNG_VALUE,
                "fake-image-content".getBytes());

        mockMvc.perform(multipart("/api/media/upload")
                .file(file)
                .param("subjectId", subjectId)
                .param("caption", "Math homework")
                .cookie(accessCookie))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.subjectId").value(subjectId))
                .andExpect(jsonPath("$.fileName").value("sample.png"))
                .andExpect(jsonPath("$.url").isString());

        mockMvc.perform(get("/api/media")
                .cookie(accessCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].subjectId").value(subjectId))
                .andExpect(jsonPath("$[0].fileName").value("sample.png"));

        mockMvc.perform(get("/api/media")
                .param("subjectId", subjectId)
                .cookie(accessCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].subjectId").value(subjectId));
    }

    @Test
    void uploadRejectsNonImageFiles() throws Exception {
        Cookie accessCookie = registerUserAndGetAccessCookie();
        String subjectId = createSubject(accessCookie);

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "notes.txt",
                MediaType.TEXT_PLAIN_VALUE,
                "not an image".getBytes());

        mockMvc.perform(multipart("/api/media/upload")
                .file(file)
                .param("subjectId", subjectId)
                .cookie(accessCookie))
                .andExpect(status().isBadRequest());
    }

    @Test
    void uploadAcceptsOctetStreamOrNullWithImageExtension() throws Exception {
        Cookie accessCookie = registerUserAndGetAccessCookie();
        String subjectId = createSubject(accessCookie);

        MockMultipartFile octetStreamFile = new MockMultipartFile(
                "file",
                "image.jpg",
                MediaType.APPLICATION_OCTET_STREAM_VALUE,
                "fake-image-content".getBytes());

        mockMvc.perform(multipart("/api/media/upload")
                .file(octetStreamFile)
                .param("subjectId", subjectId)
                .cookie(accessCookie))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fileName").value("image.jpg"));

        MockMultipartFile nullContentTypeFile = new MockMultipartFile(
                "file",
                "photo.png",
                null,
                "fake-image-content".getBytes());

        mockMvc.perform(multipart("/api/media/upload")
                .file(nullContentTypeFile)
                .param("subjectId", subjectId)
                .cookie(accessCookie))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fileName").value("photo.png"));
    }

    @Test
    void authenticatedUserCanDeleteMedia() throws Exception {
        Cookie accessCookie = registerUserAndGetAccessCookie();
        String subjectId = createSubject(accessCookie);
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "to-delete.jpg",
                MediaType.IMAGE_JPEG_VALUE,
                "fake-image-content".getBytes());

        String responseBody = mockMvc.perform(multipart("/api/media/upload")
                .file(file)
                .param("subjectId", subjectId)
                .cookie(accessCookie))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String mediaId = responseBody.replaceFirst(".*\\\"id\\\":\\\"([^\\\"]+)\\\".*", "$1");

        mockMvc.perform(delete("/api/media/" + mediaId)
                .cookie(accessCookie))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/media")
                .param("subjectId", subjectId)
                .cookie(accessCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void presignedUrlReturns402WhenStorageOrPhotoQuotaExceeded() throws Exception {
        RegisteredUser user = registerUserWithId();
        String subjectId = createSubject(user.accessCookie());

        // Within limits (with and without sizeBytes)
        mockMvc.perform(get("/api/media/presigned-url")
                        .cookie(user.accessCookie())
                        .param("subjectId", subjectId)
                        .param("fileName", "ok.png")
                        .param("contentType", "image/png")
                        .param("sizeBytes", "1024"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.url").isString())
                .andExpect(jsonPath("$.objectKey").isString());

        // Exceed storage quota
        jdbcTemplate.update(
                "UPDATE users SET storage_used_bytes = ? WHERE id = ?",
                BillingPlan.FREE_STORAGE_QUOTA_BYTES - 100L,
                user.userId()
        );

        mockMvc.perform(get("/api/media/presigned-url")
                        .cookie(user.accessCookie())
                        .param("subjectId", subjectId)
                        .param("fileName", "too-big.png")
                        .param("contentType", "image/png")
                        .param("sizeBytes", "1024"))
                .andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.code").value("QUOTA_EXCEEDED"))
                .andExpect(jsonPath("$.quotaType").value("storage"));

        // Reset storage used, exhaust monthly photo quota
        jdbcTemplate.update("UPDATE users SET storage_used_bytes = 0 WHERE id = ?", user.userId());
        seedMonthlyUsage(user.userId(), BillingPlan.FREE_MONTHLY_PHOTOS, 0);

        mockMvc.perform(get("/api/media/presigned-url")
                        .cookie(user.accessCookie())
                        .param("subjectId", subjectId)
                        .param("fileName", "over-photo-limit.png")
                        .param("contentType", "image/png")
                        .param("sizeBytes", "100"))
                .andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.code").value("QUOTA_EXCEEDED"))
                .andExpect(jsonPath("$.quotaType").value("photos"));
    }

    @Test
    void uploadReturns402WithoutCallingStorageOn21stUpload() throws Exception {
        RegisteredUser user = registerUserWithId();
        String subjectId = createSubject(user.accessCookie());
        seedMonthlyUsage(user.userId(), BillingPlan.FREE_MONTHLY_PHOTOS - 1, 0);

        MockMultipartFile twentiethFile = new MockMultipartFile(
                "file",
                "photo20.png",
                MediaType.IMAGE_PNG_VALUE,
                "fake-image-content-20".getBytes()
        );

        mockMvc.perform(multipart("/api/media/upload")
                        .file(twentiethFile)
                        .param("subjectId", subjectId)
                        .cookie(user.accessCookie()))
                .andExpect(status().isCreated());

        clearInvocations(objectStorageService);

        MockMultipartFile twentyFirstFile = new MockMultipartFile(
                "file",
                "photo21.png",
                MediaType.IMAGE_PNG_VALUE,
                "fake-image-content-21".getBytes()
        );

        mockMvc.perform(multipart("/api/media/upload")
                        .file(twentyFirstFile)
                        .param("subjectId", subjectId)
                        .cookie(user.accessCookie()))
                .andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.code").value("QUOTA_EXCEEDED"))
                .andExpect(jsonPath("$.quotaType").value("photos"));

        verify(objectStorageService, never()).store(any(), any());
    }

    @Test
    void confirmUploadIdempotencyDoesNotConsumeExtraQuotaAndDeleteReleasesStorage() throws Exception {
        RegisteredUser user = registerUserWithId();
        String subjectId = createSubject(user.accessCookie());
        seedMonthlyUsage(user.userId(), BillingPlan.FREE_MONTHLY_PHOTOS - 1, 0);

        UUID clientUploadId = UUID.randomUUID();
        String objectKey = user.userId() + "/" + subjectId + "/confirmed.png";

        String confirmBody = mockMvc.perform(post("/api/media/confirm-upload")
                        .cookie(user.accessCookie())
                        .param("subjectId", subjectId)
                        .param("clientUploadId", clientUploadId.toString())
                        .param("objectKey", objectKey)
                        .param("fileName", "confirmed.png")
                        .param("contentType", "image/png")
                        .param("sizeBytes", "2048"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String mediaId = confirmBody.replaceFirst(".*\\\"id\\\":\\\"([^\\\"]+)\\\".*", "$1");

        // Re-sending same clientUploadId succeeds even though user is now at 20/20 photos
        mockMvc.perform(post("/api/media/confirm-upload")
                        .cookie(user.accessCookie())
                        .param("subjectId", subjectId)
                        .param("clientUploadId", clientUploadId.toString())
                        .param("objectKey", objectKey)
                        .param("fileName", "confirmed.png")
                        .param("contentType", "image/png")
                        .param("sizeBytes", "2048"))
                .andExpect(status().isCreated());

        // New clientUploadId fails with 402 QUOTA_EXCEEDED
        mockMvc.perform(post("/api/media/confirm-upload")
                        .cookie(user.accessCookie())
                        .param("subjectId", subjectId)
                        .param("clientUploadId", UUID.randomUUID().toString())
                        .param("objectKey", user.userId() + "/" + subjectId + "/confirmed-21.png")
                        .param("fileName", "confirmed-21.png")
                        .param("contentType", "image/png")
                        .param("sizeBytes", "2048"))
                .andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.code").value("QUOTA_EXCEEDED"))
                .andExpect(jsonPath("$.quotaType").value("photos"));

        // Deleting media releases storage bytes without refunding monthly photo count
        mockMvc.perform(delete("/api/media/" + mediaId)
                        .cookie(user.accessCookie()))
                .andExpect(status().isNoContent());

        Long storageUsed = jdbcTemplate.queryForObject(
                "SELECT storage_used_bytes FROM users WHERE id = ?",
                Long.class,
                user.userId()
        );
        Integer photosUsed = jdbcTemplate.queryForObject(
                "SELECT photos_uploaded_count FROM usage_monthly WHERE user_id = ? AND year_month = ?",
                Integer.class,
                user.userId(),
                YearMonth.now(ZoneOffset.UTC).toString()
        );
        assertEquals(0L, storageUsed);
        assertEquals(BillingPlan.FREE_MONTHLY_PHOTOS, photosUsed);
    }

    @Test
    void negativeSizeBytesReturns400OnPresignedUrlAndConfirmUpload() throws Exception {
        RegisteredUser user = registerUserWithId();
        String subjectId = createSubject(user.accessCookie());

        mockMvc.perform(get("/api/media/presigned-url")
                        .cookie(user.accessCookie())
                        .param("subjectId", subjectId)
                        .param("fileName", "bad.png")
                        .param("contentType", "image/png")
                        .param("sizeBytes", "-1"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/media/confirm-upload")
                        .cookie(user.accessCookie())
                        .param("subjectId", subjectId)
                        .param("objectKey", user.userId() + "/" + subjectId + "/bad.png")
                        .param("fileName", "bad.png")
                        .param("contentType", "image/png")
                        .param("sizeBytes", "-1"))
                .andExpect(status().isBadRequest());
    }

    private RegisteredUser registerUserWithId() throws Exception {
        String email = "media-" + UUID.randomUUID() + "@example.com";
        MockHttpServletResponse response = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email
                                + "\",\"password\":\"password123\",\"displayName\":\"Media User\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse();

        UUID userId = jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, email);
        return new RegisteredUser(userId, response.getCookie("access_token"));
    }

    private void seedMonthlyUsage(UUID userId, int photosCount, int questionsCount) {
        String yearMonth = YearMonth.now(ZoneOffset.UTC).toString();
        jdbcTemplate.update(
                """
                INSERT INTO usage_monthly (id, user_id, year_month, photos_uploaded_count, questions_asked_count, updated_at)
                VALUES (?, ?, ?, ?, ?, NOW())
                """,
                UUID.randomUUID(),
                userId,
                yearMonth,
                photosCount,
                questionsCount
        );
    }

    private record RegisteredUser(UUID userId, Cookie accessCookie) {}

    private Cookie registerUserAndGetAccessCookie() throws Exception {
        String email = "media-" + UUID.randomUUID() + "@example.com";
        MockHttpServletResponse response = mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email
                        + "\",\"password\":\"password123\",\"displayName\":\"Media User\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse();

        return response.getCookie("access_token");
    }

    private String createSubject(Cookie accessCookie) throws Exception {
        String subjectName = "Media subject " + UUID.randomUUID();
        String responseBody = mockMvc.perform(post("/api/subjects")
                .cookie(accessCookie)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + subjectName + "\",\"colorHex\":\"#1F4D3A\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();

        return responseBody.replaceFirst(".*\\\"id\\\":\\\"([^\\\"]+)\\\".*", "$1");
    }
}
