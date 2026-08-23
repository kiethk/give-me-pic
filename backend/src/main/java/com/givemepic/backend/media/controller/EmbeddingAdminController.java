package com.givemepic.backend.media.controller;

import com.givemepic.backend.media.repository.DocumentChunkRepository;
import com.givemepic.backend.media.service.EmbeddingService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Admin-only backfill endpoint for re-embedding chunks that are stuck in
 * {@code pending} or {@code failed} state.
 *
 * <p>This controller is intentionally <strong>NOT</strong> available in
 * production ({@code @Profile("dev")}). There is no auth guard — it is
 * designed for local developer use only via Postman/curl.
 *
 * <p>TODO: if a proper admin role is added in the future, guard this with
 * role-based security and remove the profile restriction.
 */
@RestController
@RequestMapping("/api/admin/embeddings")
@RequiredArgsConstructor
@Profile("dev")
public class EmbeddingAdminController {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingAdminController.class);

    private static final List<String> RETRIABLE_STATUSES = List.of("pending", "failed");

    private final DocumentChunkRepository documentChunkRepository;
    private final EmbeddingService embeddingService;

    /**
     * POST /api/admin/embeddings/backfill
     *
     * <p>Finds all chunks whose {@code embedding_status} is {@code pending} or
     * {@code failed}, groups them by {@code media_id}, and calls
     * {@link EmbeddingService#embedMedia(UUID)} for each unique media.
     *
     * @return a summary: total chunks queued, how many are now completed, how
     *         many remain failed after this run.
     */
    @PostMapping("/backfill")
    public ResponseEntity<Map<String, Object>> backfill() {
        List<UUID> mediaIds = documentChunkRepository.findDistinctMediaIdByEmbeddingStatusIn(RETRIABLE_STATUSES);

        if (mediaIds.isEmpty()) {
            return ResponseEntity.ok(Map.of(
                    "message", "No pending/failed chunks found — nothing to backfill.",
                    "mediaProcessed", 0));
        }

        log.info("Backfill started: {} media IDs with pending/failed chunks", mediaIds.size());

        int totalSuccess = 0;
        for (UUID mediaId : mediaIds) {
            totalSuccess += embeddingService.embedMedia(mediaId);
        }

        // Count how many chunks remain failed after this run
        long stillFailed = documentChunkRepository.findByEmbeddingStatusIn(List.of("failed")).size();

        log.info("Backfill completed: {} media processed, {} total chunks now embedded, {} still failed",
                mediaIds.size(), totalSuccess, stillFailed);

        return ResponseEntity.ok(Map.of(
                "mediaProcessed", mediaIds.size(),
                "chunksEmbedded", totalSuccess,
                "chunksStillFailed", stillFailed));
    }
}
