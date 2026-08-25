package com.givemepic.backend.media.dto;

import com.givemepic.backend.media.entity.Media;

import java.time.Instant;
import java.util.UUID;

public record MediaResponse(
        UUID id,
        UUID subjectId,
        String fileName,
        String contentType,
        long sizeBytes,
        String caption,
        String url,
        String ocrStatus,
        String ocrError,
        String embeddingStatus,
        String embeddingError,
        Instant createdAt
) {
    public static MediaResponse from(Media media) {
        return from(media, media.getUrl());
    }

    public static MediaResponse from(Media media, String url) {
        return new MediaResponse(
                media.getId(),
                media.getSubjectId(),
                media.getFileName(),
                media.getContentType(),
                media.getSizeBytes(),
                media.getCaption(),
                url,
                media.getOcrStatus(),
                media.getOcrError(),
                media.getEmbeddingStatus(),
                media.getEmbeddingError(),
                media.getCreatedAt()
        );
    }
}
