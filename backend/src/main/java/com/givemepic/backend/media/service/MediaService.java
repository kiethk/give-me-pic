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
import java.util.Optional;
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

    @Value("${app.base-url:http://localhost:8080}")
    private String baseUrl;

    /** Returns the backend proxy URL for an image. Accessible from any LAN client via port 8080. */
    private String imageProxyUrl(java.util.UUID mediaId) {
        return "/api/media/" + mediaId + "/image";
    }

    @Transactional(readOnly = true)
    public List<MediaResponse> list(UUID userId) {
        return mediaRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(media -> MediaResponse.from(media, imageProxyUrl(media.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public Optional<Media> findByIdForUser(UUID userId, UUID mediaId) {
        return mediaRepository.findById(mediaId)
                .filter(m -> m.getUserId().equals(userId));
    }

    @Transactional(readOnly = true)
    public List<MediaResponse> listBySubject(UUID userId, UUID subjectId) {
        validateSubjectOwnership(userId, subjectId);
        return mediaRepository.findByUserIdAndSubjectIdOrderByCreatedAtDesc(userId, subjectId)
                .stream()
                .map(media -> MediaResponse.from(media, imageProxyUrl(media.getId())))
                .toList();
    }

    public String generateObjectKey(UUID userId, UUID subjectId, String originalName) {
        validateSubjectOwnership(userId, subjectId);
        String sanitizedName = originalName.replace("\\", "/");
        String storedName = UUID.randomUUID() + "_" + sanitizedName.substring(sanitizedName.lastIndexOf('/') + 1);
        return userId + "/" + subjectId + "/" + storedName;
    }

    @Transactional
    public MediaResponse confirmUpload(UUID userId, UUID subjectId, String caption, UUID clientUploadId, 
                                       String objectKey, String fileName, String contentType, long sizeBytes) {
        if (clientUploadId != null) {
            Optional<Media> existing = mediaRepository.findByUserIdAndClientUploadId(userId, clientUploadId);
            if (existing.isPresent()) {
                String downloadUrl = objectStorageService.createDownloadUrl(existing.get().getStoragePath());
                return MediaResponse.from(existing.get(), downloadUrl);
            }
        }

        validateSubjectOwnership(userId, subjectId);
        if (sizeBytes > maxFileSizeBytes) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ảnh vượt quá dung lượng cho phép");
        }
        try {
            Media media = Media.builder()
                    .userId(userId)
                    .subjectId(subjectId)
                    .fileName(fileName)
                    .storedName(objectKey.substring(objectKey.lastIndexOf('/') + 1))
                    .contentType(contentType)
                    .sizeBytes(sizeBytes)
                    .caption(caption)
                    .storagePath(objectKey)
                    .url(objectKey)
                    .clientUploadId(clientUploadId)
                    .build();
            Media savedMedia = mediaRepository.save(media);
            eventPublisher.publishEvent(new MediaUploadedEvent(savedMedia.getId()));
            return MediaResponse.from(savedMedia, imageProxyUrl(savedMedia.getId()));
        } catch (org.springframework.dao.DataIntegrityViolationException ex) {
            if (clientUploadId != null) {
                Optional<Media> existing = mediaRepository.findByUserIdAndClientUploadId(userId, clientUploadId);
                if (existing.isPresent()) {
                    String downloadUrl = objectStorageService.createDownloadUrl(existing.get().getStoragePath());
                    return MediaResponse.from(existing.get(), downloadUrl);
                }
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Client upload ID conflict", ex);
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
    public void retryProcessing(UUID userId, UUID mediaId) {
        Media media = mediaRepository.findById(mediaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy file"));
        if (!media.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền xử lý file này");
        }

        media.setOcrStatus("pending");
        media.setOcrError(null);
        media.setEmbeddingStatus("pending");
        media.setEmbeddingError(null);
        mediaRepository.save(media);
        eventPublisher.publishEvent(new MediaUploadedEvent(media.getId()));
    }

    private Subject validateSubjectOwnership(UUID userId, UUID subjectId) {
        return subjectRepository.findByIdAndUserId(subjectId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy môn học"));
    }
}
