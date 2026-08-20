package com.givemepic.backend.media.event;

import java.util.UUID;

public record MediaUploadedEvent(UUID mediaId) {
}
