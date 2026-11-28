package com.givemepic.backend.billing.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "usage_monthly",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_usage_monthly_user_month",
                columnNames = {"user_id", "year_month"}
        )
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UsageMonthly {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "year_month", nullable = false, length = 7)
    private String yearMonth;

    @Column(name = "photos_uploaded_count", nullable = false)
    @Builder.Default
    private Integer photosUploadedCount = 0;

    @Column(name = "questions_asked_count", nullable = false)
    @Builder.Default
    private Integer questionsAskedCount = 0;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        updatedAt = Instant.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
