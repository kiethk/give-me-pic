package com.givemepic.backend.subject.dto;

import com.givemepic.backend.subject.entity.Subject;

import java.time.Instant;
import java.util.UUID;

public record SubjectResponse(
        UUID id,
        String name,
        String description,
        String colorHex,
        String semester,
        boolean archived,
        Instant createdAt,
        Instant updatedAt
) {
    public static SubjectResponse from(Subject subject) {
        return new SubjectResponse(
                subject.getId(),
                subject.getName(),
                subject.getDescription(),
                subject.getColorHex(),
                subject.getSemester(),
                subject.getArchived(),
                subject.getCreatedAt(),
                subject.getUpdatedAt()
        );
    }
}