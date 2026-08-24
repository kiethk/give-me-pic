package com.givemepic.backend.chat.dto;

import java.util.UUID;

public record CitationResponse(
        UUID chunkId,
        UUID mediaId,
        String fileName,
        String imageUrl,
        Double similarityScore
) {}