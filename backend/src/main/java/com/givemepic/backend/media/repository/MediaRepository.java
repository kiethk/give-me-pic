package com.givemepic.backend.media.repository;

import com.givemepic.backend.media.entity.Media;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MediaRepository extends JpaRepository<Media, UUID> {
    List<Media> findByUserIdOrderByCreatedAtDesc(UUID userId);
    List<Media> findByUserIdAndSubjectIdOrderByCreatedAtDesc(UUID userId, UUID subjectId);
}
