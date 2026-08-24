package com.givemepic.backend.chat.dto;

import java.time.Instant;
import java.util.UUID;

public record ChatSessionSummary(
        UUID sessionId,
        UUID subjectId,
        String title,
        Instant createdAt,
        Instant updatedAt
) {}