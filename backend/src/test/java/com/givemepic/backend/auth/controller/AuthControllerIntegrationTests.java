package com.givemepic.backend.auth.controller;

import org.junit.jupiter.api.Test;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockHttpServletResponse;
import jakarta.servlet.http.Cookie;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AuthControllerIntegrationTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void registerIsPublicAndReturnsTokens() throws Exception {
        String email = "test-" + UUID.randomUUID() + "@example.com";
        String request = "{\"email\":\"" + email
                + "\",\"password\":\"password123\",\"displayName\":\"Test User\"}";

        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.email").value(email));
    }

    @Test
    void registerRejectsInvalidRequest() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"invalid-email\",\"password\":\"short\",\"displayName\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors").isMap());
    }

    @Test
    void registerRejectsDuplicateEmail() throws Exception {
        String email = "duplicate-" + UUID.randomUUID() + "@example.com";
        String request = "{\"email\":\"" + email
                + "\",\"password\":\"password123\",\"displayName\":\"Test User\"}";

        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
                .andExpect(status().isConflict());
    }

    @Test
    void loginReturnsTokensForValidCredentials() throws Exception {
        String email = "login-" + UUID.randomUUID() + "@example.com";
        String registerRequest = "{\"email\":\"" + email
                + "\",\"password\":\"password123\",\"displayName\":\"Test User\"}";

        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(registerRequest))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"password123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.email").value(email));
    }

    @Test
    void loginRejectsWrongPassword() throws Exception {
        String email = "wrong-password-" + UUID.randomUUID() + "@example.com";
        String registerRequest = "{\"email\":\"" + email
                + "\",\"password\":\"password123\",\"displayName\":\"Test User\"}";

        mockMvc.perform(post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(registerRequest))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void meReturnsProfileWithAccessCookie() throws Exception {
        String email = "me-" + UUID.randomUUID() + "@example.com";
        String registerRequest = "{\"email\":\"" + email
                + "\",\"password\":\"password123\",\"displayName\":\"Test User\"}";

        MockHttpServletResponse registerResponse = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(registerRequest))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse();

        Cookie accessCookie = registerResponse.getCookie("access_token");

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/auth/me")
                        .cookie(accessCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.displayName").value("Test User"));
    }

    @Test
    void meRejectsRequestWithoutCookie() throws Exception {
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void logoutClearsAuthCookies() throws Exception {
        mockMvc.perform(post("/api/auth/logout"))
                .andExpect(status().isNoContent())
                .andExpect(result -> {
                    org.hamcrest.MatcherAssert.assertThat(result.getResponse().getHeaders("Set-Cookie"),
                            org.hamcrest.Matchers.hasSize(2));
                    org.hamcrest.MatcherAssert.assertThat(result.getResponse().getHeaders("Set-Cookie").toString(),
                            org.hamcrest.Matchers.allOf(
                                    org.hamcrest.Matchers.containsString("access_token="),
                                    org.hamcrest.Matchers.containsString("refresh_token=")));
                });
    }
}