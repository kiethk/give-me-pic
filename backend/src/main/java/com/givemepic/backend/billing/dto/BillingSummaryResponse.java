package com.givemepic.backend.billing.dto;

import java.time.Instant;

/**
 * Summary of a user's subscription tier, active plan, monthly usage counters, and storage quota.
 */
public record BillingSummaryResponse(
        String tier,
        String activePlan,
        Instant expiresAt,
        int photosUsed,
        int photosLimit,
        int questionsUsed,
        int questionsLimit,
        long storageUsedBytes,
        long storageQuotaBytes
) {
}
