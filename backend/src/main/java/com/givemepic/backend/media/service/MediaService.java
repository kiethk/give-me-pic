package com.givemepic.backend.media.service;

import com.givemepic.backend.media.dto.MediaResponse;
import com.givemepic.backend.media.entity.Media;
import com.givemepic.backend.media.repository.MediaRepository;
import com.givemepic.backend.subject.entity.Subject;
import com.givemepic.backend.subject.repository.SubjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MediaService {

    private final MediaRepository mediaRepository;
    private final SubjectRepository subjectRepository;

    @Value("${app.media-upload-dir:${user.home}/givemepic-uploads}")
    private String uploadDir;

    @Value("${app.base-url:http://localhost:8080}")
    private String baseUrl;

    @Transactional(readOnly = true)
    public List<MediaResponse> list(UUID userId) {
        return mediaRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(MediaResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<MediaResponse> listBySubject(UUID userId, UUID subjectId) {
        validateSubjectOwnership(userId, subjectId);
        return mediaRepository.findByUserIdAndSubjectIdOrderByCreatedAtDesc(userId, subjectId)
                .stream()
                .map(MediaResponse::from)
                .toList();
    }

    @Transactional
    public MediaResponse upload(UUID userId, UUID subjectId, String caption, MultipartFile file) {
        validateSubjectOwnership(userId, subjectId);

        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File không được để trống");
        }

        String originalName = Objects.requireNonNullElse(file.getOriginalFilename(), "upload");
        String sanitizedName = originalName.replace("\\", "/");
        String storedName = UUID.randomUUID() + "_" + sanitizedName.substring(sanitizedName.lastIndexOf('/') + 1);

        try {
            Path baseDir = Paths.get(uploadDir).toAbsolutePath().normalize();
            Files.createDirectories(baseDir);

            Path target = baseDir.resolve(storedName);
            try (InputStream inputStream = file.getInputStream()) {
                Files.copy(inputStream, target, StandardCopyOption.REPLACE_EXISTING);
            }

            Media media = Media.builder()
                    .userId(userId)
                    .subjectId(subjectId)
                    .fileName(originalName)
                    .storedName(storedName)
                    .contentType(file.getContentType())
                    .sizeBytes(file.getSize())
                    .caption(caption)
                    .storagePath(target.toString())
                    .url(baseUrl + "/uploads/" + storedName)
                    .build();

            return MediaResponse.from(mediaRepository.save(media));
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Không thể lưu file", ex);
        }
    }

    @Transactional
    public void delete(UUID userId, UUID mediaId) {
        Media media = mediaRepository.findById(mediaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy file"));

        if (!media.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền xóa file này");
        }

        try {
            Path target = Paths.get(media.getStoragePath());
            Files.deleteIfExists(target);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Không thể xóa file", ex);
        }

        mediaRepository.delete(media);
    }

    private Subject validateSubjectOwnership(UUID userId, UUID subjectId) {
        return subjectRepository.findByIdAndUserId(subjectId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy môn học"));
    }
}
