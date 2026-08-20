package com.givemepic.backend.media.service;

import com.givemepic.backend.media.dto.MediaResponse;
import com.givemepic.backend.media.entity.Media;
import com.givemepic.backend.media.event.MediaUploadedEvent;
import com.givemepic.backend.media.repository.MediaRepository;
import com.givemepic.backend.media.service.OcrProcessingService;
import com.givemepic.backend.media.storage.ObjectStorageService;
import com.givemepic.backend.subject.entity.Subject;
import com.givemepic.backend.subject.repository.SubjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MediaService {

    private final MediaRepository mediaRepository;
    private final SubjectRepository subjectRepository;
    private final ObjectStorageService objectStorageService;
    private final ApplicationEventPublisher eventPublisher;
    private final OcrProcessingService ocrProcessingService;

    @Value("${app.media.max-file-size-bytes:10485760}")
    private long maxFileSizeBytes;

    @Transactional(readOnly = true)
    public List<MediaResponse> list(UUID userId) {
        return mediaRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(media -> MediaResponse.from(media, objectStorageService.createDownloadUrl(media.getStoragePath())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<MediaResponse> listBySubject(UUID userId, UUID subjectId) {
        validateSubjectOwnership(userId, subjectId);
        return mediaRepository.findByUserIdAndSubjectIdOrderByCreatedAtDesc(userId, subjectId)
                .stream()
                .map(media -> MediaResponse.from(media, objectStorageService.createDownloadUrl(media.getStoragePath())))
                .toList();
    }

    @Transactional
    public MediaResponse upload(UUID userId, UUID subjectId, String caption, MultipartFile file) {
        validateSubjectOwnership(userId, subjectId);

        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File không được để trống");
        }

        if (file.getContentType() == null || !file.getContentType().startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chỉ hỗ trợ file hình ảnh");
        }

        if (file.getSize() > maxFileSizeBytes) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ảnh vượt quá dung lượng cho phép");
        }

        String originalName = Objects.requireNonNullElse(file.getOriginalFilename(), "upload");
        String sanitizedName = originalName.replace("\\", "/");
        String storedName = UUID.randomUUID() + "_" + sanitizedName.substring(sanitizedName.lastIndexOf('/') + 1);
        String objectKey = userId + "/" + subjectId + "/" + storedName;

        try {
            objectStorageService.store(objectKey, file);

            Media media = Media.builder()
                    .userId(userId)
                    .subjectId(subjectId)
                    .fileName(originalName)
                    .storedName(storedName)
                    .contentType(file.getContentType())
                    .sizeBytes(file.getSize())
                    .caption(caption)
                    .storagePath(objectKey)
                    .url(objectKey)
                    .build();

            Media savedMedia = mediaRepository.save(media);
            eventPublisher.publishEvent(new MediaUploadedEvent(savedMedia.getId()));
            return MediaResponse.from(savedMedia, objectStorageService.createDownloadUrl(objectKey));
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Không thể lưu file vào storage", ex);
        }
    }

    @Transactional
    public void delete(UUID userId, UUID mediaId) {
        Media media = mediaRepository.findById(mediaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy file"));

        if (!media.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền xóa file này");
        }

        objectStorageService.delete(media.getStoragePath());
        mediaRepository.delete(media);
    }

    @Transactional
    public void retryOcr(UUID userId, UUID mediaId) {
        Media media = mediaRepository.findById(mediaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy file"));
        if (!media.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền xử lý file này");
        }

        media.setOcrStatus("pending");
        media.setOcrError(null);
        mediaRepository.save(media);
        ocrProcessingService.retry(mediaId);
    }

    private Subject validateSubjectOwnership(UUID userId, UUID subjectId) {
        return subjectRepository.findByIdAndUserId(subjectId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy môn học"));
    }
}
