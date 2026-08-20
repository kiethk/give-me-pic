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
        Instant createdAt
) {
    public static MediaResponse from(Media media) {
        return new MediaResponse(
                media.getId(),
                media.getSubjectId(),
                media.getFileName(),
                media.getContentType(),
                media.getSizeBytes(),
                media.getCaption(),
                media.getUrl(),
                media.getCreatedAt()
        );
    }
}
