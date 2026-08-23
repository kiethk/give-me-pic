package com.givemepic.backend.chat.dto;

import java.util.UUID;

public record SimilaritySearchResponse(
        UUID chunkId,
        UUID mediaId,
        String fileName,
        String content,
        int chunkIndex,
        double distance
) {}
