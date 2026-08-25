package com.givemepic.backend.media.repository;

import com.givemepic.backend.media.entity.DocumentChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface DocumentChunkRepository extends JpaRepository<DocumentChunk, UUID> {
    List<DocumentChunk> findByMediaIdOrderByChunkIndexAsc(UUID mediaId);

    @Modifying
    @Query("DELETE FROM DocumentChunk c WHERE c.mediaId = :mediaId")
    void deleteByMediaId(UUID mediaId);

    List<DocumentChunk> findByEmbeddingStatusIn(List<String> statuses);

    @Query("SELECT DISTINCT dc.mediaId FROM DocumentChunk dc WHERE dc.embeddingStatus IN :statuses")
    List<UUID> findDistinctMediaIdByEmbeddingStatusIn(List<String> statuses);
}
