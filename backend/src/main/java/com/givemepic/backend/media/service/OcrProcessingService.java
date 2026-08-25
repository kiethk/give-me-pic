package com.givemepic.backend.media.service;

import com.givemepic.backend.media.event.MediaUploadedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OcrProcessingService {

    private final OcrTransactionService ocrTransactionService;

    @Async("ocrTaskExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleMediaUploaded(MediaUploadedEvent event) {
        ocrTransactionService.process(event.mediaId());
    }

}
