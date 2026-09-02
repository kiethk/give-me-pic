package com.givemepic.backend.auth.dto;

import java.util.UUID;

public record UserProfileResponse(
        UUID userId,
        String email,
        String displayName,
        String avatarUrl,
        String subscriptionTier
) {
}