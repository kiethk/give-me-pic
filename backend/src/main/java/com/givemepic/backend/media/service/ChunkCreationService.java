package com.givemepic.backend.media.service;

import com.givemepic.backend.media.entity.DocumentChunk;
import com.givemepic.backend.media.entity.OcrResult;
import com.givemepic.backend.media.event.ChunksCreatedEvent;
import com.givemepic.backend.media.repository.DocumentChunkRepository;
import com.givemepic.backend.media.repository.OcrResultRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ChunkCreationService {

    private final OcrResultRepository ocrResultRepository;
    private final DocumentChunkRepository documentChunkRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public void createChunks(UUID mediaId, UUID ocrResultId) {
        OcrResult ocrResult = ocrResultRepository.findById(ocrResultId).orElse(null);
        if (ocrResult == null || ocrResult.getRawText() == null || ocrResult.getRawText().isBlank()) {
            return;
        }

        List<String> rawChunks = split(ocrResult.getRawText(), 1200);
        List<DocumentChunk> chunks = new ArrayList<>();

        for (int i = 0; i < rawChunks.size(); i++) {
            String content = rawChunks.get(i);
            if (!content.isBlank()) {
                chunks.add(DocumentChunk.builder()
                        .mediaId(mediaId)
                        .ocrResultId(ocrResultId)
                        .chunkIndex(chunks.size())
                        .content(content)
                        .tokenCount(estimateTokenCount(content))
                        .build());
            }
        }

        if (!chunks.isEmpty()) {
            documentChunkRepository.saveAll(chunks);
            eventPublisher.publishEvent(new ChunksCreatedEvent(mediaId));
        }
    }

    public List<String> split(String rawText, int maxCharacters) {
        List<String> chunks = new ArrayList<>();
        if (rawText == null || rawText.isEmpty()) {
            return chunks;
        }

        String[] lines = rawText.replace("\r\n", "\n").split("\n+");
        StringBuilder current = new StringBuilder();

        for (String line : lines) {
            if (current.length() + line.length() + 1 > maxCharacters) {
                flush(chunks, current);
            }
            if (line.length() > maxCharacters) {
                int start = 0;
                while (start < line.length()) {
                    int end = Math.min(start + maxCharacters, line.length());
                    chunks.add(line.substring(start, end).trim());
                    start = end;
                }
            } else {
                if (current.length() > 0) {
                    current.append("\n");
                }
                current.append(line);
            }
        }
        flush(chunks, current);
        return chunks;
    }

    private void flush(List<String> chunks, StringBuilder current) {
        if (current.length() > 0) {
            chunks.add(current.toString().trim());
            current.setLength(0);
        }
    }

    private int estimateTokenCount(String content) {
        if (content == null) return 0;
        return content.split("\\s+").length;
    }
}