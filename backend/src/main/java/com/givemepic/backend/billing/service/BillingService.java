package com.givemepic.backend.billing.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.givemepic.backend.auth.service.AuthService;
import com.givemepic.backend.billing.dto.OrderResponse;
import com.givemepic.backend.billing.entity.Subscription;
import com.givemepic.backend.billing.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Orchestrates PayOS checkout order creation, idempotent webhook processing,
 * fallback polling status sync, and early-renewal expiry stacking.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class BillingService {

    private static final long MAX_SAFE_PAYOS_ORDER_CODE = 9_007_199_254_740_991L;
    private static final long CHECKOUT_EXPIRY_SECONDS = 900L;
    private static final String PAYOS_SUCCESS_CODE = "00";
    private static final String STATUS_PENDING = "pending";
    private static final String STATUS_ACTIVE = "active";
    private static final String STATUS_CANCELLED = "cancelled";
    private static final String STATUS_EXPIRED = "expired";

    private final SubscriptionRepository subscriptionRepository;
    private final PayOsClient payOsClient;
    private final AuthService authService;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Creates a PayOS payment link outside any DB transaction and persists a pending subscription row.
     */
    public OrderResponse createOrder(UUID userId, String planCode) {
        BillingPlan plan = BillingPlan.fromCode(planCode);
        long orderCode = generateUniqueOrderCode();
        Instant now = Instant.now();
        Instant checkoutExpiresAt = now.plusSeconds(CHECKOUT_EXPIRY_SECONDS);

        PayOsClient.PayOsCreateResult paymentLink = payOsClient.createPaymentLink(
                orderCode,
                plan.getAmountVnd(),
                plan.getDescription(),
                checkoutExpiresAt.getEpochSecond()
        );

        Subscription subscription = Subscription.builder()
                .userId(userId)
                .orderCode(orderCode)
                .plan(plan.getCode())
                .amountVnd(plan.getAmountVnd())
                .status(STATUS_PENDING)
                .paymentProvider("payos")
                .paymentReference(paymentLink.paymentLinkId())
                .checkoutUrl(paymentLink.checkoutUrl())
                .qrCode(paymentLink.qrCode())
                .expiresAt(checkoutExpiresAt)
                .build();

        Subscription saved = transactionTemplate.execute(status -> subscriptionRepository.save(subscription));
        return OrderResponse.from(saved);
    }

    /**
     * Fetches the user's order status, polling PayOS outside any transaction before locking to update.
     */
    public OrderResponse getOrderStatus(UUID userId, long orderCode) {
        OrderResponse snapshot = subscriptionRepository.findOrderSnapshotByOrderCodeAndUserId(orderCode, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));

        if (!STATUS_PENDING.equals(snapshot.status())) {
            return snapshot;
        }

        PayOsClient.PayOsStatusResult paymentInfo = payOsClient.getPaymentInfo(orderCode);
        Subscription updated = transactionTemplate.execute(txStatus -> {
            Subscription locked = subscriptionRepository.findByOrderCodeForUpdate(orderCode)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));

            if (!STATUS_PENDING.equals(locked.getStatus())) {
                return locked;
            }
            if ("PAID".equalsIgnoreCase(paymentInfo.status()) && paymentInfo.amountPaid() >= locked.getAmountVnd()) {
                return activateLockedPendingSubscription(locked, paymentInfo.reference(), paymentInfo.amountPaid());
            }
            if ("CANCELLED".equalsIgnoreCase(paymentInfo.status())) {
                locked.setStatus(STATUS_CANCELLED);
                return subscriptionRepository.save(locked);
            }
            if ("EXPIRED".equalsIgnoreCase(paymentInfo.status())) {
                locked.setStatus(STATUS_EXPIRED);
                return subscriptionRepository.save(locked);
            }
            return locked;
        });

        return OrderResponse.from(updated);
    }

    /**
     * Verifies a raw PayOS webhook payload and idempotently activates the matching subscription.
     */
    public void handlePayOsWebhook(String rawBody) {
        if (rawBody == null || rawBody.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Empty webhook body");
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(rawBody);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid webhook JSON", e);
        }

        if (root == null || !root.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid webhook payload");
        }

        JsonNode dataNode = root.get("data");
        if (dataNode == null || !dataNode.isObject()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid webhook data");
        }

        String code = root.path("code").asText("");
        boolean isSuccess = !root.has("success")
                || root.path("success").isNull()
                || root.path("success").asBoolean();
        String signature = textOrNull(root.get("signature"));

        if (!payOsClient.verifyWebhookSignature(dataNode, signature)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid webhook signature");
        }

        if (!PAYOS_SUCCESS_CODE.equals(code) || !isSuccess) {
            log.info("Ignoring non-successful PayOS webhook (code={}, success={})", code, isSuccess);
            return;
        }

        long orderCode = dataNode.path("orderCode").asLong(0L);
        if (orderCode <= 0) {
            log.info("Ignoring PayOS webhook for invalid orderCode={}", orderCode);
            return;
        }

        int amountPaid = dataNode.hasNonNull("amount")
                ? dataNode.path("amount").asInt(0)
                : dataNode.path("amountPaid").asInt(0);
        String paymentReference = textOrNull(dataNode.get("reference"));
        if (paymentReference == null) {
            paymentReference = textOrNull(dataNode.get("paymentLinkId"));
        }

        final String resolvedReference = paymentReference;
        transactionTemplate.executeWithoutResult(txStatus -> {
            Optional<Subscription> locked = subscriptionRepository.findByOrderCodeForUpdate(orderCode);
            if (locked.isEmpty()) {
                log.info("Ignoring PayOS webhook for unknown orderCode={}", orderCode);
                return;
            }
            activateLockedPendingSubscription(locked.get(), resolvedReference, amountPaid);
        });
    }

    /**
     * Atomically transitions a pending subscription to active, stacking onto any existing active expiry.
     */
    public Subscription activateOrderIfPending(long orderCode, String paymentReference, int amountPaid) {
        return transactionTemplate.execute(txStatus -> {
            Subscription locked = subscriptionRepository.findByOrderCodeForUpdate(orderCode)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found"));
            return activateLockedPendingSubscription(locked, paymentReference, amountPaid);
        });
    }

    private Subscription activateLockedPendingSubscription(
            Subscription sub,
            String paymentReference,
            int amountPaid) {
        if (STATUS_ACTIVE.equals(sub.getStatus())) {
            return sub;
        }
        if (!STATUS_PENDING.equals(sub.getStatus())) {
            log.warn("Cannot activate orderCode={} in status={}", sub.getOrderCode(), sub.getStatus());
            return sub;
        }
        if (amountPaid < sub.getAmountVnd()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Insufficient payment amount");
        }

        Instant now = Instant.now();
        BillingPlan plan = BillingPlan.fromCode(sub.getPlan());
        Optional<Subscription> existingActive = subscriptionRepository
                .findFirstByUserIdAndStatusAndExpiresAtAfterOrderByExpiresAtDesc(
                        sub.getUserId(),
                        STATUS_ACTIVE,
                        now
                );

        Instant baseTime = existingActive.map(Subscription::getExpiresAt).orElse(now);
        Instant newExpiresAt = baseTime.plus(plan.getDurationDays(), ChronoUnit.DAYS);

        sub.setStatus(STATUS_ACTIVE);
        sub.setStartedAt(now);
        sub.setExpiresAt(newExpiresAt);
        if (paymentReference != null) {
            sub.setPaymentReference(paymentReference);
        }

        Subscription saved = subscriptionRepository.saveAndFlush(sub);
        subscriptionRepository.markOtherActiveAsExpired(saved.getUserId(), saved.getId(), now);
        authService.activateProTier(saved.getUserId(), BillingPlan.PRO_STORAGE_QUOTA_BYTES);

        log.info("Activated Pro plan={} for userId={} orderCode={} expiresAt={}",
                saved.getPlan(), saved.getUserId(), saved.getOrderCode(), newExpiresAt);
        return saved;
    }

    private long generateUniqueOrderCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            long candidate = Instant.now().getEpochSecond() * 1000L
                    + ThreadLocalRandom.current().nextInt(100, 1000);
            if (candidate > 0 && candidate <= MAX_SAFE_PAYOS_ORDER_CODE
                    && !subscriptionRepository.existsByOrderCode(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("Failed to generate a unique PayOS order code");
    }

    private static String textOrNull(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        String text = node.asText();
        return text == null || text.isBlank() ? null : text;
    }
}
