package com.givemepic.backend.media.repository;

import com.givemepic.backend.media.entity.OcrResult;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface OcrResultRepository extends JpaRepository<OcrResult, UUID> {
    Optional<OcrResult> findByMediaId(UUID mediaId);
}
