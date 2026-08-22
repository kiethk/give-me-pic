package com.givemepic.backend.media.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chunk_embeddings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChunkEmbedding {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "chunk_id", nullable = false, unique = true)
    private UUID chunkId;

    @Column(name = "embedding", nullable = false, columnDefinition = "vector(768)")
    private String embedding;

    @Column(name = "model_name", nullable = false, length = 50)
    private String modelName;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
    }
}
