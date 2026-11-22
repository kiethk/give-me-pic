package com.givemepic.backend.subject.dto;

import java.util.UUID;

public record SuggestSubjectResponse(
        UUID matchedSubjectId,
        String suggestedName,
        boolean isNew
) {}
