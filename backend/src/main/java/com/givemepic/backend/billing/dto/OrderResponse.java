package com.givemepic.backend.billing.dto;

import com.givemepic.backend.billing.entity.Subscription;

import java.time.Instant;

/**
 * Response payload describing a subscription checkout order and its current status.
 */
public record OrderResponse(
        long orderCode,
        String plan,
        int amountVnd,
        String status,
        String qrCode,
        String checkoutUrl,
        Instant expiresAt
) {
    /**
     * Maps a {@link Subscription} entity to an {@link OrderResponse} DTO.
     */
    public static OrderResponse from(Subscription subscription) {
        return new OrderResponse(
                subscription.getOrderCode(),
                subscription.getPlan(),
                subscription.getAmountVnd(),
                subscription.getStatus(),
                subscription.getQrCode(),
                subscription.getCheckoutUrl(),
                subscription.getExpiresAt()
        );
    }
}
