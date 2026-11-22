package com.givemepic.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record GoogleAuthRequest(
        @NotBlank(message = "idToken không được để trống")
        String idToken
) {}
