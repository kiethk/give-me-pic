package com.givemepic.backend.billing.repository;

import com.givemepic.backend.billing.dto.OrderResponse;
import com.givemepic.backend.billing.entity.Subscription;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {
    boolean existsByOrderCode(Long orderCode);
    Optional<Subscription> findByOrderCode(Long orderCode);

    @Query("""
            SELECT new com.givemepic.backend.billing.dto.OrderResponse(
                s.orderCode,
                s.plan,
                s.amountVnd,
                s.status,
                s.qrCode,
                s.checkoutUrl,
                s.expiresAt
            )
            FROM Subscription s
            WHERE s.orderCode = :orderCode
              AND s.userId = :userId
            """)
    Optional<OrderResponse> findOrderSnapshotByOrderCodeAndUserId(
            @Param("orderCode") Long orderCode,
            @Param("userId") UUID userId
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM Subscription s WHERE s.orderCode = :orderCode")
    Optional<Subscription> findByOrderCodeForUpdate(@Param("orderCode") Long orderCode);

    Optional<Subscription> findFirstByUserIdAndStatusOrderByExpiresAtDesc(UUID userId, String status);

    boolean existsByUserIdAndStatusAndExpiresAtAfter(UUID userId, String status, Instant now);

    Optional<Subscription> findFirstByUserIdAndStatusAndExpiresAtAfterOrderByExpiresAtDesc(
            UUID userId,
            String status,
            Instant now
    );

    @Query("""
            SELECT DISTINCT s.userId
            FROM Subscription s
            WHERE s.status = 'active'
              AND s.expiresAt <= :now
            """)
    List<UUID> findDistinctUserIdsWithExpiredActive(@Param("now") Instant now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Subscription s
            SET s.status = 'expired',
                s.updatedAt = :now
            WHERE s.userId = :userId
              AND s.status = 'active'
              AND s.expiresAt <= :now
            """)
    int markExpiredActiveForUser(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Subscription s
            SET s.status = 'expired',
                s.updatedAt = :now
            WHERE s.status = 'active'
              AND s.expiresAt <= :now
            """)
    int markAllExpiredActive(@Param("now") Instant now);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE Subscription s
            SET s.status = 'expired',
                s.updatedAt = :now
            WHERE s.userId = :userId
              AND s.status = 'active'
              AND s.id <> :excludeId
            """)
    int markOtherActiveAsExpired(
            @Param("userId") UUID userId,
            @Param("excludeId") UUID excludeId,
            @Param("now") Instant now
    );
}
