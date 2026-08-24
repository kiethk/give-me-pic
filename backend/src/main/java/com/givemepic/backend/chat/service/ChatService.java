package com.givemepic.backend.chat.service;

import com.givemepic.backend.chat.dto.ChatHistoryMessageResponse;
import com.givemepic.backend.chat.dto.ChatMessageResponse;
import com.givemepic.backend.chat.dto.ChatRequest;
import com.givemepic.backend.chat.dto.ChatSessionSummary;
import com.givemepic.backend.chat.dto.CitationResponse;
import com.givemepic.backend.chat.dto.SimilaritySearchResponse;
import com.givemepic.backend.media.service.EmbeddingProvider;
import com.givemepic.backend.media.service.LlmProvider;
import com.givemepic.backend.media.storage.ObjectStorageService;

import org.springframework.transaction.annotation.Transactional;

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
    private final LlmProvider llmProvider;
    private final ObjectStorageService storageService;

    /**
     * Performs a vector similarity search (cosine distance) on chunk_embeddings.
     * If subjectId is provided, filters the search results to that specific
     * subject.
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
                    m.storage_path AS storage_path,
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
                rs.getString("storage_path"),
                rs.getString("content"),
                rs.getInt("chunk_index"),
                rs.getDouble("distance")), vectorLiteral, userId, subjectId, subjectId, limit);
    }

    @Transactional
    public ChatMessageResponse answer(UUID userId, ChatRequest request) {
        UUID sessionId = request.sessionId();
        if (sessionId == null) {
            sessionId = UUID.randomUUID();
            jdbcTemplate.update("""
                    INSERT INTO chat_sessions (id, user_id, subject_id, created_at, updated_at)
                    VALUES (?, ?, ?, NOW(), NOW())
                    """, sessionId, userId, request.subjectId());
        }

        List<SimilaritySearchResponse> chunks = search(userId, request.question(), request.subjectId(), 5);

        String context = chunks.stream()
                .map(SimilaritySearchResponse::content)
                .collect(Collectors.joining("\n---\n"));

        String prompt = """
                Bạn là trợ lý học tập. Dựa vào các đoạn ghi chú bài giảng sau đây,
                hãy trả lời câu hỏi của học sinh một cách ngắn gọn, chính xác,
                bằng tiếng Việt.
                Nếu thông tin không đủ để trả lời, hãy nói rõ là không tìm thấy
                thông tin liên quan, đừng bịa ra câu trả lời.

                === GHI CHÚ BÀI GIẢNG ===
                %s

                === CÂU HỎI ===
                %s
                """.formatted(context, request.question());

        String answer = llmProvider.generateAnswer(prompt);

        UUID userMessageId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO chat_messages (id, session_id, role, content, created_at)
                VALUES (?, ?, 'user', ?, NOW())
                """, userMessageId, sessionId, request.question());

        UUID assistantMessageId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO chat_messages (id, session_id, role, content, created_at)
                VALUES (?, ?, 'assistant', ?, NOW())
                """, assistantMessageId, sessionId, answer);

        for (SimilaritySearchResponse chunk : chunks) {
            jdbcTemplate.update("""
                    INSERT INTO message_citations (id, message_id, chunk_id, media_id, similarity_score)
                    VALUES (?, ?, ?, ?, ?)
                    """, UUID.randomUUID(), assistantMessageId, chunk.chunkId(), chunk.mediaId(),
                    (float) chunk.distance());
        }

        List<CitationResponse> citations = chunks.stream()
                .map(c -> new CitationResponse(
                        c.chunkId(),
                        c.mediaId(),
                        c.fileName(),
                        storageService.createDownloadUrl(c.storagePath()),
                        c.distance()))
                .collect(Collectors.toList());

        return new ChatMessageResponse(sessionId, assistantMessageId, answer, citations);
    }

    public List<ChatSessionSummary> listSessions(UUID userId) {
        String sql = """
                SELECT id, subject_id, title, created_at, updated_at
                FROM chat_sessions
                WHERE user_id = ?
                ORDER BY updated_at DESC
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new ChatSessionSummary(
                UUID.fromString(rs.getString("id")),
                rs.getString("subject_id") != null ? UUID.fromString(rs.getString("subject_id")) : null,
                rs.getString("title"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant()), userId);
    }

    public List<ChatHistoryMessageResponse> getSessionMessages(UUID userId, UUID sessionId) {
        // Xác nhận session này thuộc đúng user, tránh lộ hội thoại của user khác
        String ownerCheckSql = "SELECT COUNT(*) FROM chat_sessions WHERE id = ? AND user_id = ?";
        Integer count = jdbcTemplate.queryForObject(ownerCheckSql, Integer.class, sessionId, userId);
        if (count == null || count == 0) {
            throw new IllegalArgumentException("Session không tồn tại hoặc không thuộc về user này");
        }

        String messagesSql = """
                SELECT id, role, content, created_at
                FROM chat_messages
                WHERE session_id = ?
                ORDER BY created_at ASC
                """;
        List<ChatHistoryMessageResponse> messages = jdbcTemplate.query(messagesSql, (rs, rowNum) -> {
            UUID messageId = UUID.fromString(rs.getString("id"));
            List<CitationResponse> citations = getCitationsForMessage(messageId);
            return new ChatHistoryMessageResponse(
                    messageId,
                    rs.getString("role"),
                    rs.getString("content"),
                    rs.getTimestamp("created_at").toInstant(),
                    citations);
        }, sessionId);

        return messages;
    }

    private List<CitationResponse> getCitationsForMessage(UUID messageId) {
        String sql = """
                SELECT mc.chunk_id, mc.media_id, mc.similarity_score, m.file_name, m.storage_path
                FROM message_citations mc
                JOIN media_files m ON mc.media_id = m.id
                WHERE mc.message_id = ?
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new CitationResponse(
                UUID.fromString(rs.getString("chunk_id")),
                UUID.fromString(rs.getString("media_id")),
                rs.getString("file_name"),
                storageService.createDownloadUrl(rs.getString("storage_path")),
                rs.getDouble("similarity_score")), messageId);
    }
}
