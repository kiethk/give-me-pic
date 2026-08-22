package com.givemepic.backend.media.service;

import com.givemepic.backend.media.entity.DocumentChunk;
import com.givemepic.backend.media.entity.OcrResult;
import com.givemepic.backend.media.event.OcrCompletedEvent;
import com.givemepic.backend.media.repository.DocumentChunkRepository;
import com.givemepic.backend.media.repository.OcrResultRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ChunkingService {

    private final OcrResultRepository ocrResultRepository;
    private final DocumentChunkRepository documentChunkRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Async("ocrTaskExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleOcrCompleted(OcrCompletedEvent event) {
        createChunks(event.mediaId(), event.ocrResultId());
    }

    @Transactional
    public void createChunks(UUID mediaId, UUID ocrResultId) {
        OcrResult result = ocrResultRepository.findById(ocrResultId).orElse(null);
        if (result == null || result.getRawText() == null || result.getRawText().isBlank()) {
            return;
        }

        List<String> chunks = split(result.getRawText(), 1200);
        documentChunkRepository.deleteByMediaId(mediaId);

        List<DocumentChunk> entities = new ArrayList<>();
        for (int index = 0; index < chunks.size(); index++) {
            String content = chunks.get(index);
            entities.add(DocumentChunk.builder()
                    .mediaId(mediaId)
                    .ocrResultId(ocrResultId)
                    .chunkIndex(index)
                    .content(content)
                    .tokenCount(estimateTokenCount(content))
                    .build());
        }
        documentChunkRepository.saveAll(entities);
        eventPublisher.publishEvent(new com.givemepic.backend.media.event.ChunksCreatedEvent(mediaId));
    }

    List<String> split(String rawText, int maxCharacters) {
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();

        for (String paragraph : rawText.replace("\r\n", "\n").split("\n+")) {
            String normalized = paragraph.trim();
            if (normalized.isEmpty()) {
                continue;
            }

            if (normalized.length() > maxCharacters) {
                flush(chunks, current);
                for (int start = 0; start < normalized.length(); start += maxCharacters) {
                    chunks.add(normalized.substring(start, Math.min(start + maxCharacters, normalized.length())));
                }
                continue;
            }

            if (current.length() > 0 && current.length() + normalized.length() + 1 > maxCharacters) {
                flush(chunks, current);
            }
            if (current.length() > 0) {
                current.append('\n');
            }
            current.append(normalized);
        }

        flush(chunks, current);
        return chunks;
    }

    private void flush(List<String> chunks, StringBuilder current) {
        if (current.length() > 0) {
            chunks.add(current.toString());
            current.setLength(0);
        }
    }

    private int estimateTokenCount(String content) {
        return content.isBlank() ? 0 : content.trim().split("\\s+").length;
    }
}
