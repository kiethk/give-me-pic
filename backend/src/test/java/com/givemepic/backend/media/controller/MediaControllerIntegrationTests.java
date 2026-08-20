package com.givemepic.backend.media.controller;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class MediaControllerIntegrationTests {

    @Autowired
    private MockMvc mockMvc;

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
                .param("caption", "Bài tập toán")
                .cookie(accessCookie))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.subjectId").value(subjectId))
                .andExpect(jsonPath("$.fileName").value("sample.png"));
    }

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
