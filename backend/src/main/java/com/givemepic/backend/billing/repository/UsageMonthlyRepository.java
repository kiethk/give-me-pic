package com.givemepic.backend.billing.repository;

import com.givemepic.backend.billing.entity.UsageMonthly;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface UsageMonthlyRepository extends JpaRepository<UsageMonthly, UUID> {
    Optional<UsageMonthly> findByUserIdAndYearMonth(UUID userId, String yearMonth);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            INSERT INTO usage_monthly (id, user_id, year_month, photos_uploaded_count, questions_asked_count, updated_at)
            VALUES (:id, :userId, :yearMonth, 1, 0, now())
            ON CONFLICT (user_id, year_month) DO UPDATE
            SET photos_uploaded_count = usage_monthly.photos_uploaded_count + 1,
                updated_at = now()
            WHERE usage_monthly.photos_uploaded_count < :limit
            """, nativeQuery = true)
    int tryIncrementPhotos(
            @Param("id") UUID id,
            @Param("userId") UUID userId,
            @Param("yearMonth") String yearMonth,
            @Param("limit") int limit
    );

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            INSERT INTO usage_monthly (id, user_id, year_month, photos_uploaded_count, questions_asked_count, updated_at)
            VALUES (:id, :userId, :yearMonth, 0, 1, now())
            ON CONFLICT (user_id, year_month) DO UPDATE
            SET questions_asked_count = usage_monthly.questions_asked_count + 1,
                updated_at = now()
            WHERE usage_monthly.questions_asked_count < :limit
            """, nativeQuery = true)
    int tryIncrementQuestions(
            @Param("id") UUID id,
            @Param("userId") UUID userId,
            @Param("yearMonth") String yearMonth,
            @Param("limit") int limit
    );
}
