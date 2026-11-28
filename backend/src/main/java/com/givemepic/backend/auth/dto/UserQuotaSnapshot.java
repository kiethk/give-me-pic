package com.givemepic.backend.auth.dto;

import java.util.UUID;

/**
 * Snapshot of a user's current subscription tier and storage quota usage.
 */
public record UserQuotaSnapshot(
        UUID userId,
        String subscriptionTier,
        long storageQuotaBytes,
        long storageUsedBytes
) {
}
