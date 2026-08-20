package com.givemepic.backend.subject.controller;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class SubjectControllerIntegrationTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void subjectsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/subjects"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void authenticatedUserCanCreateAndListSubject() throws Exception {
        Cookie accessCookie = registerUserAndGetAccessCookie();
        String subjectName = "Toan " + UUID.randomUUID();

        mockMvc.perform(post("/api/subjects")
                        .cookie(accessCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + subjectName
                                + "\",\"description\":\"On tap\",\"colorHex\":\"#1F4D3A\",\"semester\":\"HK1 2026-2027\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value(subjectName))
                .andExpect(jsonPath("$.archived").value(false));

        mockMvc.perform(get("/api/subjects").cookie(accessCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value(subjectName));
    }

    @Test
    void createRejectsInvalidSubject() throws Exception {
        Cookie accessCookie = registerUserAndGetAccessCookie();

        mockMvc.perform(post("/api/subjects")
                        .cookie(accessCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"colorHex\":\"green\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors").isMap());
    }

    @Test
    void deleteArchivesSubjectFromDefaultList() throws Exception {
        Cookie accessCookie = registerUserAndGetAccessCookie();
        MockHttpServletResponse createResponse = mockMvc.perform(post("/api/subjects")
                        .cookie(accessCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Archived subject\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse();

        String subjectId = createResponse.getContentAsString()
                .replaceFirst(".*\\\"id\\\":\\\"([^\\\"]+)\\\".*", "$1");

        mockMvc.perform(delete("/api/subjects/" + subjectId).cookie(accessCookie))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/subjects").cookie(accessCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '" + subjectId + "')]").isEmpty());
    }

    private Cookie registerUserAndGetAccessCookie() throws Exception {
        String email = "subject-" + UUID.randomUUID() + "@example.com";
        MockHttpServletResponse response = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email
                                + "\",\"password\":\"password123\",\"displayName\":\"Subject User\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse();

        return response.getCookie("access_token");
    }
}