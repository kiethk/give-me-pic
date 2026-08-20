package com.givemepic.backend.media.controller;

import com.givemepic.backend.media.dto.MediaResponse;
import com.givemepic.backend.media.service.MediaService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
import java.util.UUID;

@RestController
@RequestMapping("/api/media")
@RequiredArgsConstructor
public class MediaController {

    private final MediaService mediaService;

    @GetMapping
    public ResponseEntity<List<MediaResponse>> list(
            @AuthenticationPrincipal UUID userId,
            @RequestParam(required = false) UUID subjectId) {
        if (subjectId != null) {
            return ResponseEntity.ok(mediaService.listBySubject(userId, subjectId));
        }
        return ResponseEntity.ok(mediaService.list(userId));
    }

    @PostMapping("/upload")
    public ResponseEntity<MediaResponse> upload(
            @AuthenticationPrincipal UUID userId,
            @RequestParam UUID subjectId,
            @RequestParam(required = false) String caption,
            @RequestPart("file") MultipartFile file) {
        MediaResponse response = mediaService.upload(userId, subjectId, caption, file);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal UUID userId,
            @PathVariable UUID id) {
        mediaService.delete(userId, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/ocr/retry")
    public ResponseEntity<Void> retryOcr(
            @AuthenticationPrincipal UUID userId,
            @PathVariable UUID id) {
        mediaService.retryOcr(userId, id);
        return ResponseEntity.accepted().build();
    }
}
