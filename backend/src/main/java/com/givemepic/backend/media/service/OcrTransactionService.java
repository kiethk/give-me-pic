package com.givemepic.backend.media.service;

import com.givemepic.backend.media.entity.Media;
import com.givemepic.backend.media.entity.OcrResult;
import com.givemepic.backend.media.event.OcrCompletedEvent;
import com.givemepic.backend.media.repository.MediaRepository;
import com.givemepic.backend.media.repository.OcrResultRepository;
import com.givemepic.backend.media.storage.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OcrTransactionService {

    private final MediaRepository mediaRepository;
    private final OcrResultRepository ocrResultRepository;
    private final ObjectStorageService objectStorageService;
    private final OcrEngine ocrEngine;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public void process(UUID mediaId) {
        Media media = mediaRepository.findById(mediaId).orElse(null);
        if (media == null) {
            return;
        }

        media.setOcrStatus("processing");
        media.setOcrError(null);
        mediaRepository.save(media);

        try {
            byte[] content = objectStorageService.download(media.getStoragePath());
            String rawText = ocrEngine.extractText(content, media.getContentType(), media.getFileName());

            OcrResult result = ocrResultRepository.findByMediaId(mediaId)
                    .orElseGet(() -> OcrResult.builder()
                            .mediaId(mediaId)
                            .ocrEngine(ocrEngine.name())
                            .build());
            result.setRawText(rawText);
            result.setErrorMessage(null);
            result.setProcessedAt(Instant.now());
            OcrResult savedResult = ocrResultRepository.save(result);

            media.setOcrStatus("completed");
            media.setOcrError(null);
                    eventPublisher.publishEvent(new OcrCompletedEvent(mediaId, savedResult.getId()));
        } catch (Throwable ex) {
            media.setOcrStatus("failed");
            media.setOcrError(ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName());

            OcrResult result = ocrResultRepository.findByMediaId(mediaId)
                    .orElseGet(() -> OcrResult.builder()
                            .mediaId(mediaId)
                            .ocrEngine(ocrEngine.name())
                            .build());
            result.setErrorMessage(ex.getMessage());
            result.setProcessedAt(Instant.now());
            ocrResultRepository.save(result);
        }

        mediaRepository.save(media);
    }
}
