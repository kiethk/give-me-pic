package com.givemepic.backend.media.service;

import com.givemepic.backend.billing.service.QuotaService;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.net.URLConnection;
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
    private final QuotaService quotaService;

    @Value("${app.media.max-file-size-bytes:10485760}")
    private long maxFileSizeBytes;

    @Value("${app.base-url:http://localhost:8080}")
    private String baseUrl;

    /** Returns the backend proxy URL for an image. Accessible from any LAN client via port 8080. */
    private String imageProxyUrl(UUID mediaId) {
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

    @Transactional
    public MediaResponse upload(UUID userId, UUID subjectId, String caption, UUID clientUploadId, MultipartFile file) {
        if (clientUploadId != null) {
            Optional<Media> existing = mediaRepository.findByUserIdAndClientUploadId(userId, clientUploadId);
            if (existing.isPresent()) {
                String downloadUrl = objectStorageService.createDownloadUrl(existing.get().getStoragePath());
                return MediaResponse.from(existing.get(), downloadUrl);
            }
        }

        validateSubjectOwnership(userId, subjectId);
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File must not be empty");
        }
        String originalName = Objects.requireNonNullElse(file.getOriginalFilename(), "upload");
        String resolvedContentType = resolveImageContentType(file.getContentType(), originalName);
        if (resolvedContentType == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only image files are supported");
        }
        if (file.getSize() > maxFileSizeBytes) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image exceeds maximum allowed size");
        }
        String objectKey = buildObjectKey(userId, subjectId, originalName);
        String storedName = objectKey.substring(objectKey.lastIndexOf('/') + 1);
        quotaService.consumeUploadQuota(userId, file.getSize());
        try {
            objectStorageService.store(objectKey, file);
            Media media = Media.builder()
                    .userId(userId)
                    .subjectId(subjectId)
                    .fileName(originalName)
                    .storedName(storedName)
                    .contentType(resolvedContentType)
                    .sizeBytes(file.getSize())
                    .caption(caption)
                    .storagePath(objectKey)
                    .url(objectKey)
                    .clientUploadId(clientUploadId)
                    .build();
            Media savedMedia = mediaRepository.save(media);
            eventPublisher.publishEvent(new MediaUploadedEvent(savedMedia.getId()));
            return MediaResponse.from(savedMedia, imageProxyUrl(savedMedia.getId()));
        } catch (DataIntegrityViolationException ex) {
            if (clientUploadId != null) {
                Optional<Media> existing = mediaRepository.findByUserIdAndClientUploadId(userId, clientUploadId);
                if (existing.isPresent()) {
                    String downloadUrl = objectStorageService.createDownloadUrl(existing.get().getStoragePath());
                    return MediaResponse.from(existing.get(), downloadUrl);
                }
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Client upload ID conflict", ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to save file to storage", ex);
        }
    }

    public String generateObjectKey(UUID userId, UUID subjectId, String originalName) {
        return generateObjectKey(userId, subjectId, originalName, 0L);
    }

    public String generateObjectKey(UUID userId, UUID subjectId, String originalName, long sizeBytes) {
        validateSubjectOwnership(userId, subjectId);
        quotaService.assertUploadAllowed(userId, sizeBytes);
        return buildObjectKey(userId, subjectId, originalName);
    }

    private String buildObjectKey(UUID userId, UUID subjectId, String originalName) {
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
        if (sizeBytes < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File size must not be negative");
        }
        if (sizeBytes > maxFileSizeBytes) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image exceeds maximum allowed size");
        }
        String resolvedContentType = resolveImageContentType(contentType, fileName);
        if (resolvedContentType == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only image files are supported");
        }
        quotaService.consumeUploadQuota(userId, sizeBytes);
        try {
            Media media = Media.builder()
                    .userId(userId)
                    .subjectId(subjectId)
                    .fileName(fileName)
                    .storedName(objectKey.substring(objectKey.lastIndexOf('/') + 1))
                    .contentType(resolvedContentType)
                    .sizeBytes(sizeBytes)
                    .caption(caption)
                    .storagePath(objectKey)
                    .url(objectKey)
                    .clientUploadId(clientUploadId)
                    .build();
            Media savedMedia = mediaRepository.save(media);
            eventPublisher.publishEvent(new MediaUploadedEvent(savedMedia.getId()));
            return MediaResponse.from(savedMedia, imageProxyUrl(savedMedia.getId()));
        } catch (DataIntegrityViolationException ex) {
            if (clientUploadId != null) {
                Optional<Media> existing = mediaRepository.findByUserIdAndClientUploadId(userId, clientUploadId);
                if (existing.isPresent()) {
                    String downloadUrl = objectStorageService.createDownloadUrl(existing.get().getStoragePath());
                    return MediaResponse.from(existing.get(), downloadUrl);
                }
            }
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Client upload ID conflict", ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to save file to storage", ex);
        }
    }

    @Transactional
    public void delete(UUID userId, UUID mediaId) {
        Media media = mediaRepository.findById(mediaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "File not found"));

        if (!media.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to delete this file");
        }

        objectStorageService.delete(media.getStoragePath());
        mediaRepository.delete(media);
        quotaService.releaseStorage(userId, media.getSizeBytes());
    }

    @Transactional
    public void retryProcessing(UUID userId, UUID mediaId) {
        Media media = mediaRepository.findById(mediaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "File not found"));
        if (!media.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to process this file");
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
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Subject not found"));
    }

    private String resolveImageContentType(String contentType, String fileName) {
        if (contentType != null && !contentType.isBlank()
                && !"application/octet-stream".equalsIgnoreCase(contentType.trim())
                && contentType.startsWith("image/")) {
            return contentType;
        }

        if (fileName != null && !fileName.isBlank()) {
            String lower = fileName.toLowerCase();
            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
                return "image/jpeg";
            } else if (lower.endsWith(".png")) {
                return "image/png";
            } else if (lower.endsWith(".webp")) {
                return "image/webp";
            } else if (lower.endsWith(".heic")) {
                return "image/heic";
            } else if (lower.endsWith(".heif")) {
                return "image/heif";
            }

            String guessed = URLConnection.guessContentTypeFromName(fileName);
            if (guessed != null && guessed.startsWith("image/")) {
                return guessed;
            }
        }

        return null;
    }
}
