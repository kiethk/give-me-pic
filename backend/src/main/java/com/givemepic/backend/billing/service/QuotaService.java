package com.givemepic.backend.billing.service;

import com.givemepic.backend.auth.dto.UserQuotaSnapshot;
import com.givemepic.backend.auth.service.AuthService;
import com.givemepic.backend.billing.dto.BillingSummaryResponse;
import com.givemepic.backend.billing.entity.Subscription;
import com.givemepic.backend.billing.entity.UsageMonthly;
import com.givemepic.backend.billing.repository.SubscriptionRepository;
import com.givemepic.backend.billing.repository.UsageMonthlyRepository;
import com.givemepic.backend.common.exception.QuotaExceededException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Enforces monthly photo/question quotas, atomic storage caps, and lazy/scheduled Pro expiry.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class QuotaService {

    private static final String TIER_PRO = "pro";
    private static final String STATUS_ACTIVE = "active";

    private final AuthService authService;
    private final UsageMonthlyRepository usageMonthlyRepository;
    private final SubscriptionRepository subscriptionRepository;

    /**
     * Returns the user's current billing summary after lazily downgrading any expired Pro subscription.
     */
    @Transactional
    public BillingSummaryResponse getSummary(UUID userId) {
        lazyDowngradeIfExpired(userId);

        UserQuotaSnapshot snapshot = authService.getQuotaSnapshot(userId);
        boolean isPro = isPro(snapshot);
        int photosLimit = photoLimitFor(isPro);
        int questionsLimit = questionLimitFor(isPro);

        String activePlan = null;
        Instant expiresAt = null;
        if (isPro) {
            Optional<Subscription> activeSubscription = subscriptionRepository
                    .findFirstByUserIdAndStatusAndExpiresAtAfterOrderByExpiresAtDesc(
                            userId,
                            STATUS_ACTIVE,
                            Instant.now()
                    );
            if (activeSubscription.isPresent()) {
                activePlan = activeSubscription.get().getPlan();
                expiresAt = activeSubscription.get().getExpiresAt();
            }
        }

        Optional<UsageMonthly> usage = usageMonthlyRepository.findByUserIdAndYearMonth(userId, currentYearMonth());
        int photosUsed = usage.map(UsageMonthly::getPhotosUploadedCount).orElse(0);
        int questionsUsed = usage.map(UsageMonthly::getQuestionsAskedCount).orElse(0);

        return new BillingSummaryResponse(
                snapshot.subscriptionTier(),
                activePlan,
                expiresAt,
                photosUsed,
                photosLimit,
                questionsUsed,
                questionsLimit,
                snapshot.storageUsedBytes(),
                snapshot.storageQuotaBytes()
        );
    }

    /**
     * Pre-checks whether uploading a file of {@code fileSizeBytes} is within monthly photo and storage quotas.
     */
    @Transactional
    public void assertUploadAllowed(UUID userId, long fileSizeBytes) {
        validateNonNegativeSize(fileSizeBytes);
        lazyDowngradeIfExpired(userId);

        UserQuotaSnapshot snapshot = authService.getQuotaSnapshot(userId);
        int photoLimit = photoLimitFor(isPro(snapshot));
        int photosUsed = usageMonthlyRepository.findByUserIdAndYearMonth(userId, currentYearMonth())
                .map(UsageMonthly::getPhotosUploadedCount)
                .orElse(0);

        if (photosUsed >= photoLimit) {
            throw new QuotaExceededException(
                    "photos",
                    "Monthly photo upload limit reached (" + photoLimit + " photos/month)"
            );
        }

        if (fileSizeBytes > snapshot.storageQuotaBytes() - snapshot.storageUsedBytes()) {
            throw new QuotaExceededException(
                    "storage",
                    "Storage quota exceeded"
            );
        }
    }

    /**
     * Atomically increments the monthly photo counter and storage usage, rolling back both if either quota is exceeded.
     */
    @Transactional
    public void consumeUploadQuota(UUID userId, long fileSizeBytes) {
        validateNonNegativeSize(fileSizeBytes);
        lazyDowngradeIfExpired(userId);

        UserQuotaSnapshot snapshot = authService.getQuotaSnapshot(userId);
        int photoLimit = photoLimitFor(isPro(snapshot));

        int photosUpdated = usageMonthlyRepository.tryIncrementPhotos(
                UUID.randomUUID(),
                userId,
                currentYearMonth(),
                photoLimit
        );
        if (photosUpdated == 0) {
            throw new QuotaExceededException(
                    "photos",
                    "Monthly photo upload limit reached (" + photoLimit + " photos/month)"
            );
        }

        boolean storageUpdated = authService.incrementStorageUsedIfWithinQuota(userId, fileSizeBytes);
        if (!storageUpdated) {
            throw new QuotaExceededException(
                    "storage",
                    "Storage quota exceeded"
            );
        }
    }

    /**
     * Releases storage bytes on media deletion without refunding the monthly photo upload counter.
     */
    @Transactional
    public void releaseStorage(UUID userId, long fileSizeBytes) {
        authService.decrementStorageUsed(userId, fileSizeBytes);
    }

    /**
     * Atomically increments the monthly question counter or throws {@link QuotaExceededException} if exhausted.
     */
    @Transactional
    public void consumeQuestionQuota(UUID userId) {
        lazyDowngradeIfExpired(userId);

        UserQuotaSnapshot snapshot = authService.getQuotaSnapshot(userId);
        int questionLimit = questionLimitFor(isPro(snapshot));

        int updated = usageMonthlyRepository.tryIncrementQuestions(
                UUID.randomUUID(),
                userId,
                currentYearMonth(),
                questionLimit
        );
        if (updated == 0) {
            throw new QuotaExceededException(
                    "questions",
                    "Monthly question limit reached (" + questionLimit + " questions/month)"
            );
        }
    }

    /**
     * Downgrades a Pro user to Free if they have no remaining active unexpired subscription.
     */
    @Transactional
    public boolean lazyDowngradeIfExpired(UUID userId) {
        UserQuotaSnapshot snapshot = authService.getQuotaSnapshot(userId);
        if (!isPro(snapshot)) {
            return false;
        }

        Instant now = Instant.now();
        if (subscriptionRepository.existsByUserIdAndStatusAndExpiresAtAfter(userId, STATUS_ACTIVE, now)) {
            return false;
        }

        subscriptionRepository.markExpiredActiveForUser(userId, now);
        authService.downgradeToFreeTier(userId, BillingPlan.FREE_STORAGE_QUOTA_BYTES);
        log.info("Lazily downgraded expired Pro user {} to free tier", userId);
        return true;
    }

    /**
     * Hourly scheduled job marking expired active subscriptions and downgrading affected users with no active plan.
     */
    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void expireSubscriptionsJob() {
        Instant now = Instant.now();
        List<UUID> affectedUserIds = subscriptionRepository.findDistinctUserIdsWithExpiredActive(now);
        if (affectedUserIds.isEmpty()) {
            return;
        }

        int expiredSubscriptions = subscriptionRepository.markAllExpiredActive(now);
        int downgradedUsers = 0;
        for (UUID userId : affectedUserIds) {
            if (!subscriptionRepository.existsByUserIdAndStatusAndExpiresAtAfter(userId, STATUS_ACTIVE, now)) {
                authService.downgradeToFreeTier(userId, BillingPlan.FREE_STORAGE_QUOTA_BYTES);
                downgradedUsers++;
            }
        }
        log.info("Expired {} subscription(s) and downgraded {} user(s) to free tier", expiredSubscriptions, downgradedUsers);
    }

    private String currentYearMonth() {
        return YearMonth.now(ZoneOffset.UTC).toString();
    }

    private boolean isPro(UserQuotaSnapshot snapshot) {
        return TIER_PRO.equalsIgnoreCase(snapshot.subscriptionTier());
    }

    private int photoLimitFor(boolean isPro) {
        return isPro ? BillingPlan.PRO_MONTHLY_PHOTOS : BillingPlan.FREE_MONTHLY_PHOTOS;
    }

    private int questionLimitFor(boolean isPro) {
        return isPro ? BillingPlan.PRO_MONTHLY_QUESTIONS : BillingPlan.FREE_MONTHLY_QUESTIONS;
    }

    private void validateNonNegativeSize(long fileSizeBytes) {
        if (fileSizeBytes < 0) {
            throw new IllegalArgumentException("fileSizeBytes must be non-negative");
        }
    }
}
