package com.givemepic.backend.billing.service;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;

@Getter
@RequiredArgsConstructor
public enum BillingPlan {

    PRO_MONTHLY("pro_monthly", 49_000, 30, "GMP PRO MONTHLY"),
    PRO_YEARLY("pro_yearly", 490_000, 365, "GMP PRO YEARLY");

    public static final int FREE_MONTHLY_PHOTOS = 20;
    public static final int FREE_MONTHLY_QUESTIONS = 30;
    public static final long FREE_STORAGE_QUOTA_BYTES = 524_288_000L;

    public static final int PRO_MONTHLY_PHOTOS = 500;
    public static final int PRO_MONTHLY_QUESTIONS = 500;
    public static final long PRO_STORAGE_QUOTA_BYTES = 10_737_418_240L;

    private final String code;
    private final int amountVnd;
    private final int durationDays;
    private final String description;

    public static BillingPlan fromCode(String plan) {
        if (plan == null || plan.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid billing plan");
        }
        String normalized = plan.trim();
        return Arrays.stream(values())
                .filter(candidate -> candidate.code.equals(normalized))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid billing plan"));
    }
}
