package com.givemepic.backend.media.event;

import java.util.UUID;

public record OcrCompletedEvent(UUID mediaId, UUID ocrResultId) {
}
