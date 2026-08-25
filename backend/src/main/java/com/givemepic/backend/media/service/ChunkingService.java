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

    private final ChunkCreationService chunkCreationService;
    private final DocumentChunkRepository documentChunkRepository;

    @Async("ocrTaskExecutor")
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleOcrCompleted(OcrCompletedEvent event) {
        documentChunkRepository.deleteByMediaId(event.mediaId());
        chunkCreationService.createChunks(event.mediaId(), event.ocrResultId());
    }
}