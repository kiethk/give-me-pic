package com.givemepic.backend.media.service;

import com.givemepic.backend.media.entity.DocumentChunk;
import com.givemepic.backend.media.event.ChunksCreatedEvent;
import com.givemepic.backend.media.repository.DocumentChunkRepository;
import lombok.RequiredArgsConstructor;
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

    private final DocumentChunkRepository documentChunkRepository;
    private final EmbeddingProvider embeddingProvider;
    private final JdbcTemplate jdbcTemplate;

    @Async("ocrTaskExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleChunksCreated(ChunksCreatedEvent event) {
        embedMedia(event.mediaId());
    }

    public void embedMedia(UUID mediaId) {
        List<DocumentChunk> chunks = documentChunkRepository.findByMediaIdOrderByChunkIndexAsc(mediaId);
        for (DocumentChunk chunk : chunks) {
            List<Float> vector = embeddingProvider.embed(chunk.getContent());
            String vectorLiteral = vector.stream()
                    .map(String::valueOf)
                    .collect(java.util.stream.Collectors.joining(",", "[", "]"));
            jdbcTemplate.update("""
                    INSERT INTO chunk_embeddings (id, chunk_id, embedding, model_name, created_at)
                    VALUES (gen_random_uuid(), ?, ?::vector, ?, NOW())
                    ON CONFLICT (chunk_id) DO UPDATE SET embedding = EXCLUDED.embedding,
                        model_name = EXCLUDED.model_name
                    """, chunk.getId(), vectorLiteral, embeddingProvider.modelName());
        }
    }
}
