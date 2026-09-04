package com.givemepic.backend.media.controller;

import com.givemepic.backend.media.dto.MediaResponse;
import com.givemepic.backend.media.service.MediaService;
import com.givemepic.backend.media.storage.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/media")
@RequiredArgsConstructor
public class MediaController {

    private final MediaService mediaService;
    private final ObjectStorageService objectStorageService;

    @GetMapping
    public ResponseEntity<List<MediaResponse>> list(
            @AuthenticationPrincipal UUID userId,
            @RequestParam(required = false) UUID subjectId) {
        if (subjectId != null) {
            return ResponseEntity.ok(mediaService.listBySubject(userId, subjectId));
        }
        return ResponseEntity.ok(mediaService.list(userId));
    }

    @GetMapping("/presigned-url")
    public ResponseEntity<Map<String, String>> getPresignedUrl(
            @AuthenticationPrincipal UUID userId,
            @RequestParam UUID subjectId,
            @RequestParam String fileName,
            @RequestParam String contentType) {
        
        String objectKey = mediaService.generateObjectKey(userId, subjectId, fileName);
        String url = objectStorageService.createPresignedPutUrl(objectKey, contentType);
        
        return ResponseEntity.ok(Map.of(
                "url", url,
                "objectKey", objectKey
        ));
    }

    @PostMapping("/confirm-upload")
    public ResponseEntity<MediaResponse> confirmUpload(
            @AuthenticationPrincipal UUID userId,
            @RequestParam UUID subjectId,
            @RequestParam(required = false) String caption,
            @RequestParam(required = false) UUID clientUploadId,
            @RequestParam String objectKey,
            @RequestParam String fileName,
            @RequestParam String contentType,
            @RequestParam long sizeBytes) {
        
        MediaResponse response = mediaService.confirmUpload(userId, subjectId, caption, clientUploadId, objectKey, fileName, contentType, sizeBytes);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    /**
     * Proxy endpoint: downloads the image from MinIO internally and returns it
     * to the client through port 8080 (no need for the client to reach MinIO :9000).
     */
    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> image(
            @AuthenticationPrincipal UUID userId,
            @PathVariable UUID id) {
        return mediaService.findByIdForUser(userId, id)
                .map(media -> {
                    byte[] data = objectStorageService.download(media.getStoragePath());
                    String ct = media.getContentType() != null ? media.getContentType() : "image/jpeg";
                    return ResponseEntity.ok()
                            .header(HttpHeaders.CACHE_CONTROL, "public, max-age=3600")
                            .contentType(MediaType.parseMediaType(ct))
                            .body(data);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal UUID userId,
            @PathVariable UUID id) {
        mediaService.delete(userId, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/retry")
    public ResponseEntity<Void> retryProcessing(
            @AuthenticationPrincipal UUID userId,
            @PathVariable UUID id) {
        mediaService.retryProcessing(userId, id);
        return ResponseEntity.accepted().build();
    }
}
