package com.givemepic.backend.media.service;

import com.givemepic.backend.media.entity.Media;
import com.givemepic.backend.media.entity.OcrResult;
import com.givemepic.backend.media.repository.MediaRepository;
import com.givemepic.backend.media.repository.OcrResultRepository;
import com.givemepic.backend.media.storage.ObjectStorageService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OcrProcessingServiceTests {

    @Mock
    private MediaRepository mediaRepository;

    @Mock
    private OcrResultRepository ocrResultRepository;

    @Mock
    private ObjectStorageService objectStorageService;

    @Mock
    private OcrEngine ocrEngine;

    @InjectMocks
    private OcrTransactionService ocrTransactionService;

    @Test
    void processStoresOcrTextAndMarksMediaCompleted() {
        UUID mediaId = UUID.randomUUID();
        Media media = media(mediaId);
        when(mediaRepository.findById(mediaId)).thenReturn(Optional.of(media));
        when(objectStorageService.download("user/subject/object.jpg")).thenReturn(new byte[] {1, 2});
        when(ocrEngine.extractText(any(), eq("image/jpeg"), eq("notes.jpg"))).thenReturn("Newton's laws");
        when(ocrEngine.name()).thenReturn("test-engine");
        when(ocrResultRepository.findByMediaId(mediaId)).thenReturn(Optional.empty());

        ocrTransactionService.process(mediaId);

        assertEquals("completed", media.getOcrStatus());
        verify(ocrResultRepository).save(any(OcrResult.class));
        verify(ocrEngine).extractText(any(), eq("image/jpeg"), eq("notes.jpg"));
    }

    @Test
    void processStoresFailureAndMarksMediaFailed() {
        UUID mediaId = UUID.randomUUID();
        Media media = media(mediaId);
        when(mediaRepository.findById(mediaId)).thenReturn(Optional.of(media));
        when(objectStorageService.download("user/subject/object.jpg")).thenThrow(new IllegalStateException("MinIO unavailable"));
        when(ocrEngine.name()).thenReturn("test-engine");
        when(ocrResultRepository.findByMediaId(mediaId)).thenReturn(Optional.empty());

        ocrTransactionService.process(mediaId);

        assertEquals("failed", media.getOcrStatus());
        assertEquals("MinIO unavailable", media.getOcrError());
        verify(ocrResultRepository).save(any(OcrResult.class));
    }

    private Media media(UUID mediaId) {
        return Media.builder()
                .id(mediaId)
                .userId(UUID.randomUUID())
                .subjectId(UUID.randomUUID())
                .fileName("notes.jpg")
                .storedName("object.jpg")
                .contentType("image/jpeg")
                .sizeBytes(2L)
                .storagePath("user/subject/object.jpg")
                .url("object.jpg")
                .build();
    }
}
