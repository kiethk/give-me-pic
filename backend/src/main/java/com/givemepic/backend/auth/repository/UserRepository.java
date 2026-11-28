package com.givemepic.backend.auth.repository;

import com.givemepic.backend.auth.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);
    Optional<User> findByEmailIgnoreCase(String email);
    boolean existsByEmail(String email);
    boolean existsByEmailIgnoreCase(String email);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE User u
            SET u.storageUsedBytes = u.storageUsedBytes + :deltaBytes,
                u.updatedAt = :now
            WHERE u.id = :userId
              AND u.storageUsedBytes + :deltaBytes <= u.storageQuotaBytes
            """)
    int incrementStorageUsedIfWithinQuota(
            @Param("userId") UUID userId,
            @Param("deltaBytes") long deltaBytes,
            @Param("now") Instant now
    );

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE User u
            SET u.storageUsedBytes = CASE
                    WHEN u.storageUsedBytes > :deltaBytes THEN u.storageUsedBytes - :deltaBytes
                    ELSE 0L
                END,
                u.updatedAt = :now
            WHERE u.id = :userId
            """)
    int decrementStorageUsed(
            @Param("userId") UUID userId,
            @Param("deltaBytes") long deltaBytes,
            @Param("now") Instant now
    );

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE User u
            SET u.subscriptionTier = :tier,
                u.storageQuotaBytes = :storageQuotaBytes,
                u.updatedAt = :now
            WHERE u.id = :userId
            """)
    int updateSubscriptionTier(
            @Param("userId") UUID userId,
            @Param("tier") String tier,
            @Param("storageQuotaBytes") long storageQuotaBytes,
            @Param("now") Instant now
    );
}
