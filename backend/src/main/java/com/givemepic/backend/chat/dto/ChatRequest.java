package com.givemepic.backend.chat.dto;

import java.util.UUID;

public record ChatRequest(
        String question,
        UUID sessionId,
        UUID subjectId
) {}