package com.givemepic.backend.media.service;

import com.givemepic.backend.media.entity.OcrResult;
import com.givemepic.backend.media.repository.DocumentChunkRepository;
import com.givemepic.backend.media.repository.OcrResultRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChunkCreationServiceTests {

    @Mock
    private OcrResultRepository ocrResultRepository;

    @Mock
    private DocumentChunkRepository documentChunkRepository;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private ChunkCreationService chunkCreationService;

    @Test
    void splitKeepsLinesTogetherUntilCharacterLimit() {
        List<String> chunks = chunkCreationService.split("First line.\nSecond line.", 30);

        assertEquals(2, chunks.size());
        assertEquals("First line.", chunks.get(0));
        assertEquals("Second line.", chunks.get(1));
    }

    @Test
    void splitBreaksLongTextIntoBoundedChunks() {
        List<String> chunks = chunkCreationService.split("abcdefghijabcdefghijabcdefghij", 10);

        assertEquals(3, chunks.size());
        assertTrue(chunks.stream().allMatch(chunk -> chunk.length() <= 10));
    }

    @Test
    void createChunksIgnoresEmptyOcrText() {
        UUID resultId = UUID.randomUUID();
        when(ocrResultRepository.findById(resultId)).thenReturn(Optional.of(OcrResult.builder()
                .id(resultId)
                .mediaId(UUID.randomUUID())
                .rawText(" ")
                .ocrEngine("test")
                .build()));

        chunkCreationService.createChunks(UUID.randomUUID(), resultId);

        org.mockito.Mockito.verify(documentChunkRepository, org.mockito.Mockito.never())
                .saveAll(org.mockito.ArgumentMatchers.anyList());
    }
}