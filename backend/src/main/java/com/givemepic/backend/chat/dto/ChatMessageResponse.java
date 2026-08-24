package com.givemepic.backend.chat.dto;

import java.util.List;
import java.util.UUID;

public record ChatMessageResponse(
        UUID sessionId,
        UUID messageId,
        String answer,
        List<CitationResponse> citations
) {}