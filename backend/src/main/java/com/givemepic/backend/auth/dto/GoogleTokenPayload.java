package com.givemepic.backend.auth.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record GoogleTokenPayload(
        String sub,
        String email,
        @JsonProperty("email_verified")
        Object emailVerified,
        String name,
        String picture,
        String aud,
        String iss
) {
    public boolean isEmailVerified() {
        if (emailVerified == null) {
            return false;
        }
        return Boolean.parseBoolean(String.valueOf(emailVerified));
    }
}
