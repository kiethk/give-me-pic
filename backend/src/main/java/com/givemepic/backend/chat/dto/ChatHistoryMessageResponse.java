package com.givemepic.backend.chat.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ChatHistoryMessageResponse(
        UUID messageId,
        String role,
        String content,
        Instant createdAt,
        List<CitationResponse> citations
) {}