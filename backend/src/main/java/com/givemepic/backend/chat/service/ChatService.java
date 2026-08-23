package com.givemepic.backend.chat.service;

import com.givemepic.backend.chat.dto.SimilaritySearchResponse;
import com.givemepic.backend.media.service.EmbeddingProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChatService {

    private final EmbeddingProvider embeddingProvider;
    private final JdbcTemplate jdbcTemplate;

    /**
     * Performs a vector similarity search (cosine distance) on chunk_embeddings.
     * If subjectId is provided, filters the search results to that specific subject.
     * Otherwise, searches across all subjects owned by the user.
     */
    public List<SimilaritySearchResponse> search(UUID userId, String queryText, UUID subjectId, int limit) {
        if (queryText == null || queryText.isBlank()) {
            return List.of();
        }

        List<Float> queryVector = embeddingProvider.embed(queryText);
        String vectorLiteral = queryVector.stream()
                .map(String::valueOf)
                .collect(Collectors.joining(",", "[", "]"));

        String sql = """
                SELECT 
                    dc.id AS chunk_id,
                    dc.media_id AS media_id,
                    m.file_name AS file_name,
                    dc.content AS content,
                    dc.chunk_index AS chunk_index,
                    (ce.embedding <=> ?::vector) AS distance
                FROM document_chunks dc
                JOIN chunk_embeddings ce ON dc.id = ce.chunk_id
                JOIN media_files m ON dc.media_id = m.id
                WHERE m.user_id = ?
                  AND (?::uuid IS NULL OR m.subject_id = ?::uuid)
                ORDER BY distance ASC
                LIMIT ?
                """;

        return jdbcTemplate.query(sql, (rs, rowNum) -> new SimilaritySearchResponse(
                UUID.fromString(rs.getString("chunk_id")),
                UUID.fromString(rs.getString("media_id")),
                rs.getString("file_name"),
                rs.getString("content"),
                rs.getInt("chunk_index"),
                rs.getDouble("distance")
        ), vectorLiteral, userId, subjectId, subjectId, limit);
    }
}
