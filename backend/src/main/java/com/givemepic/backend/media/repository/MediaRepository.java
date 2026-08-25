package com.givemepic.backend.media.repository;

import com.givemepic.backend.media.entity.Media;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MediaRepository extends JpaRepository<Media, UUID> {
    List<Media> findByUserIdOrderByCreatedAtDesc(UUID userId);

    List<Media> findByUserIdAndSubjectIdOrderByCreatedAtDesc(UUID userId, UUID subjectId);

    List<Media> findByUserId(UUID userId);

    List<Media> findByUserIdAndSubjectId(UUID userId, UUID subjectId);

    Optional<Media> findByUserIdAndClientUploadId(UUID userId, UUID clientUploadId);
}
