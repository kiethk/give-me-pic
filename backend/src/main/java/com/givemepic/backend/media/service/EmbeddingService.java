package com.givemepic.backend.media.service;

import com.givemepic.backend.media.entity.DocumentChunk;
import com.givemepic.backend.media.event.ChunksCreatedEvent;
import com.givemepic.backend.media.repository.DocumentChunkRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class EmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);

    private final DocumentChunkRepository documentChunkRepository;
    private final EmbeddingProvider embeddingProvider;
    private final JdbcTemplate jdbcTemplate;

    @Async("ocrTaskExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleChunksCreated(ChunksCreatedEvent event) {
        embedMedia(event.mediaId());
    }

    /**
     * Embeds all chunks for the given media.  Each chunk is processed
     * independently: a failure on one chunk sets its status to {@code failed}
     * and records the error message in the DB, but does NOT stop processing of
     * the remaining chunks.
     *
     * @param mediaId the media whose chunks should be embedded
     * @return the number of chunks successfully embedded in this run
     */
    public int embedMedia(UUID mediaId) {
        List<DocumentChunk> chunks = documentChunkRepository.findByMediaIdOrderByChunkIndexAsc(mediaId);
        int successCount = 0;

        for (DocumentChunk chunk : chunks) {
            // Mark as processing to give visibility in case of a crash mid-loop
            setStatus(chunk.getId(), "processing", null);

            try {
                List<Float> vector = embeddingProvider.embed(chunk.getContent());
                String vectorLiteral = toVectorLiteral(vector);

                jdbcTemplate.update("""
                        INSERT INTO chunk_embeddings (id, chunk_id, embedding, model_name, created_at)
                        VALUES (gen_random_uuid(), ?, ?::vector, ?, NOW())
                        ON CONFLICT (chunk_id) DO UPDATE SET embedding = EXCLUDED.embedding,
                            model_name = EXCLUDED.model_name
                        """, chunk.getId(), vectorLiteral, embeddingProvider.modelName());

                setStatus(chunk.getId(), "completed", null);
                successCount++;

            } catch (Exception e) {
                String errorMsg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                log.warn("Embedding failed for chunk {} (media {}): {}", chunk.getId(), mediaId, errorMsg);
                setStatus(chunk.getId(), "failed", errorMsg);
                // Continue to next chunk — do NOT rethrow
            }
        }

        log.info("embedMedia({}): {}/{} chunks embedded successfully", mediaId, successCount, chunks.size());
        return successCount;
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private void setStatus(UUID chunkId, String status, String errorMsg) {
        jdbcTemplate.update(
                "UPDATE document_chunks SET embedding_status = ?, embedding_error = ? WHERE id = ?",
                status, errorMsg, chunkId);
    }

    private String toVectorLiteral(List<Float> vector) {
        return vector.stream()
                .map(String::valueOf)
                .collect(java.util.stream.Collectors.joining(",", "[", "]"));
    }
}
