package com.givemepic.backend.media.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "ocr_results")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OcrResult {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "media_id", nullable = false, unique = true)
    private UUID mediaId;

    @Column(name = "raw_text", columnDefinition = "TEXT")
    private String rawText;

    @Column(name = "confidence_score")
    private Float confidenceScore;

    @Column(name = "ocr_engine", nullable = false, length = 30)
    private String ocrEngine;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "processed_at")
    private Instant processedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }
}
