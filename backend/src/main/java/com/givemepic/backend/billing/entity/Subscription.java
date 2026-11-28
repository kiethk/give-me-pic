package com.givemepic.backend.billing.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "subscriptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Subscription {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "order_code", nullable = false, unique = true)
    private Long orderCode;

    @Column(nullable = false, length = 20)
    private String plan;

    @Column(name = "amount_vnd", nullable = false)
    private Integer amountVnd;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "payment_provider", nullable = false, length = 30)
    @Builder.Default
    private String paymentProvider = "payos";

    @Column(name = "payment_reference", length = 255)
    private String paymentReference;

    @Column(name = "checkout_url", length = 500)
    private String checkoutUrl;

    @Column(name = "qr_code", columnDefinition = "TEXT")
    private String qrCode;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
