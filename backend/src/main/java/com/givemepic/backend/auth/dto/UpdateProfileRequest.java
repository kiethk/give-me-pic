package com.givemepic.backend.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @NotBlank(message = "Display name must not be blank")
        @Size(max = 100, message = "Display name must not exceed 100 characters")
        String displayName,
        
        @Size(max = 500, message = "Avatar URL is too long")
        String avatarUrl
) {}
