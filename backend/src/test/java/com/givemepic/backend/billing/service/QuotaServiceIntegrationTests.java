package com.givemepic.backend.billing.service;

import com.givemepic.backend.auth.entity.User;
import com.givemepic.backend.auth.repository.UserRepository;
import com.givemepic.backend.billing.dto.BillingSummaryResponse;
import com.givemepic.backend.billing.entity.Subscription;
import com.givemepic.backend.billing.entity.UsageMonthly;
import com.givemepic.backend.billing.repository.SubscriptionRepository;
import com.givemepic.backend.billing.repository.UsageMonthlyRepository;
import com.givemepic.backend.common.exception.QuotaExceededException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class QuotaServiceIntegrationTests {

    @Autowired
    private QuotaService quotaService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private UsageMonthlyRepository usageMonthlyRepository;

    private final List<UUID> createdUserIds = new ArrayList<>();

    @AfterEach
    void tearDown() {
        if (!createdUserIds.isEmpty()) {
            userRepository.deleteAllById(createdUserIds);
            createdUserIds.clear();
        }
    }

    @Test
    void freeTierEnforces20MonthlyPhotoCap() {
        User user = createUser("free", BillingPlan.FREE_STORAGE_QUOTA_BYTES, 0L);

        for (int i = 0; i < BillingPlan.FREE_MONTHLY_PHOTOS; i++) {
            quotaService.consumeUploadQuota(user.getId(), 1_024L);
        }

        assertThatThrownBy(() -> quotaService.assertUploadAllowed(user.getId(), 1_024L))
                .isInstanceOf(QuotaExceededException.class)
                .satisfies(ex -> assertThat(((QuotaExceededException) ex).getQuotaType()).isEqualTo("photos"));

        assertThatThrownBy(() -> quotaService.consumeUploadQuota(user.getId(), 1_024L))
                .isInstanceOf(QuotaExceededException.class)
                .satisfies(ex -> assertThat(((QuotaExceededException) ex).getQuotaType()).isEqualTo("photos"));

        BillingSummaryResponse summary = quotaService.getSummary(user.getId());
        assertThat(summary.photosUsed()).isEqualTo(20);
        assertThat(summary.photosLimit()).isEqualTo(20);
        assertThat(summary.storageUsedBytes()).isEqualTo(20 * 1_024L);
    }

    @Test
    void freeTierEnforces30MonthlyQuestionCap() {
        User user = createUser("free", BillingPlan.FREE_STORAGE_QUOTA_BYTES, 0L);

        for (int i = 0; i < BillingPlan.FREE_MONTHLY_QUESTIONS; i++) {
            quotaService.consumeQuestionQuota(user.getId());
        }

        assertThatThrownBy(() -> quotaService.consumeQuestionQuota(user.getId()))
                .isInstanceOf(QuotaExceededException.class)
                .satisfies(ex -> assertThat(((QuotaExceededException) ex).getQuotaType()).isEqualTo("questions"));

        BillingSummaryResponse summary = quotaService.getSummary(user.getId());
        assertThat(summary.questionsUsed()).isEqualTo(30);
        assertThat(summary.questionsLimit()).isEqualTo(30);
    }

    @Test
    void storageCapRollsBackPhotoIncrementWhenExceeded() {
        User user = createUser("free", BillingPlan.FREE_STORAGE_QUOTA_BYTES, 0L);
        long firstFileBytes = 400L * 1024 * 1024;
        long secondFileBytes = 150L * 1024 * 1024;

        quotaService.consumeUploadQuota(user.getId(), firstFileBytes);

        assertThatThrownBy(() -> quotaService.assertUploadAllowed(user.getId(), secondFileBytes))
                .isInstanceOf(QuotaExceededException.class)
                .satisfies(ex -> assertThat(((QuotaExceededException) ex).getQuotaType()).isEqualTo("storage"));

        assertThatThrownBy(() -> quotaService.consumeUploadQuota(user.getId(), secondFileBytes))
                .isInstanceOf(QuotaExceededException.class)
                .satisfies(ex -> assertThat(((QuotaExceededException) ex).getQuotaType()).isEqualTo("storage"));

        String yearMonth = YearMonth.now(ZoneOffset.UTC).toString();
        UsageMonthly usage = usageMonthlyRepository.findByUserIdAndYearMonth(user.getId(), yearMonth).orElseThrow();
        assertThat(usage.getPhotosUploadedCount()).isEqualTo(1);

        BillingSummaryResponse summary = quotaService.getSummary(user.getId());
        assertThat(summary.storageUsedBytes()).isEqualTo(firstFileBytes);
        assertThat(summary.photosUsed()).isEqualTo(1);
    }

    @Test
    void releaseStorageDecrementsStorageWithoutRefundingPhotoCount() {
        User user = createUser("free", BillingPlan.FREE_STORAGE_QUOTA_BYTES, 0L);

        quotaService.consumeUploadQuota(user.getId(), 10_000L);
        quotaService.releaseStorage(user.getId(), 4_000L);

        BillingSummaryResponse summary = quotaService.getSummary(user.getId());
        assertThat(summary.storageUsedBytes()).isEqualTo(6_000L);
        assertThat(summary.photosUsed()).isEqualTo(1);
    }

    @Test
    void expiredProUserTriggersLazyDowngradeViaGetSummaryKeepingExistingStorageUsed() {
        long existingStorageUsed = 700L * 1024 * 1024;
        User user = createUser("pro", BillingPlan.PRO_STORAGE_QUOTA_BYTES, existingStorageUsed);

        Instant now = Instant.now();
        Subscription expiredSub = subscriptionRepository.save(Subscription.builder()
                .userId(user.getId())
                .orderCode(Math.abs(UUID.randomUUID().getMostSignificantBits()))
                .plan(BillingPlan.PRO_MONTHLY.getCode())
                .amountVnd(BillingPlan.PRO_MONTHLY.getAmountVnd())
                .status("active")
                .startedAt(now.minus(31, ChronoUnit.DAYS))
                .expiresAt(now.minus(1, ChronoUnit.HOURS))
                .build());

        BillingSummaryResponse summary = quotaService.getSummary(user.getId());

        assertThat(summary.tier()).isEqualTo("free");
        assertThat(summary.activePlan()).isNull();
        assertThat(summary.expiresAt()).isNull();
        assertThat(summary.storageQuotaBytes()).isEqualTo(BillingPlan.FREE_STORAGE_QUOTA_BYTES);
        assertThat(summary.storageUsedBytes()).isEqualTo(existingStorageUsed);
        assertThat(summary.photosLimit()).isEqualTo(BillingPlan.FREE_MONTHLY_PHOTOS);
        assertThat(summary.questionsLimit()).isEqualTo(BillingPlan.FREE_MONTHLY_QUESTIONS);

        Subscription refreshedSub = subscriptionRepository.findById(expiredSub.getId()).orElseThrow();
        assertThat(refreshedSub.getStatus()).isEqualTo("expired");
    }

    @Test
    void expireSubscriptionsJobDowngradesOnlyExpiredProUsers() {
        Instant now = Instant.now();
        User expiredUser = createUser("pro", BillingPlan.PRO_STORAGE_QUOTA_BYTES, 600L * 1024 * 1024);
        User activeUser = createUser("pro", BillingPlan.PRO_STORAGE_QUOTA_BYTES, 600L * 1024 * 1024);

        Subscription expiredSub = subscriptionRepository.save(Subscription.builder()
                .userId(expiredUser.getId())
                .orderCode(Math.abs(UUID.randomUUID().getMostSignificantBits()))
                .plan(BillingPlan.PRO_MONTHLY.getCode())
                .amountVnd(BillingPlan.PRO_MONTHLY.getAmountVnd())
                .status("active")
                .startedAt(now.minus(31, ChronoUnit.DAYS))
                .expiresAt(now.minus(5, ChronoUnit.MINUTES))
                .build());

        Subscription activeSub = subscriptionRepository.save(Subscription.builder()
                .userId(activeUser.getId())
                .orderCode(Math.abs(UUID.randomUUID().getMostSignificantBits()))
                .plan(BillingPlan.PRO_YEARLY.getCode())
                .amountVnd(BillingPlan.PRO_YEARLY.getAmountVnd())
                .status("active")
                .startedAt(now.minus(1, ChronoUnit.DAYS))
                .expiresAt(now.plus(364, ChronoUnit.DAYS))
                .build());

        quotaService.expireSubscriptionsJob();

        assertThat(subscriptionRepository.findById(expiredSub.getId()).orElseThrow().getStatus()).isEqualTo("expired");
        assertThat(subscriptionRepository.findById(activeSub.getId()).orElseThrow().getStatus()).isEqualTo("active");

        BillingSummaryResponse expiredSummary = quotaService.getSummary(expiredUser.getId());
        assertThat(expiredSummary.tier()).isEqualTo("free");
        assertThat(expiredSummary.storageQuotaBytes()).isEqualTo(BillingPlan.FREE_STORAGE_QUOTA_BYTES);
        assertThat(expiredSummary.storageUsedBytes()).isEqualTo(600L * 1024 * 1024);

        BillingSummaryResponse activeSummary = quotaService.getSummary(activeUser.getId());
        assertThat(activeSummary.tier()).isEqualTo("pro");
        assertThat(activeSummary.activePlan()).isEqualTo(BillingPlan.PRO_YEARLY.getCode());
        assertThat(activeSummary.storageQuotaBytes()).isEqualTo(BillingPlan.PRO_STORAGE_QUOTA_BYTES);
        assertThat(activeSummary.photosLimit()).isEqualTo(BillingPlan.PRO_MONTHLY_PHOTOS);
        assertThat(activeSummary.questionsLimit()).isEqualTo(BillingPlan.PRO_MONTHLY_QUESTIONS);
    }

    private User createUser(String tier, long storageQuotaBytes, long storageUsedBytes) {
        User saved = userRepository.save(User.builder()
                .email("quota-svc-" + UUID.randomUUID() + "@example.com")
                .passwordHash("hashed-password")
                .displayName("Quota Service Test User")
                .subscriptionTier(tier)
                .storageQuotaBytes(storageQuotaBytes)
                .storageUsedBytes(storageUsedBytes)
                .build());
        createdUserIds.add(saved.getId());
        return saved;
    }
}
