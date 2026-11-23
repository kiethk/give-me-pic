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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final EmbeddingProvider embeddingProvider;
    private final JdbcTemplate jdbcTemplate;
    private final LlmProvider llmProvider;
    private final ObjectStorageService storageService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private Executor streamExecutor = ForkJoinPool.commonPool();

    // Chunks with cosine distance above this threshold are deemed irrelevant
    private static final double RELEVANCE_THRESHOLD = 0.72;

    public void setStreamExecutor(Executor streamExecutor) {
        this.streamExecutor = streamExecutor;
    }

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
        boolean isNewSession = false;
        if (sessionId == null) {
            isNewSession = true;
            sessionId = UUID.randomUUID();
            jdbcTemplate.update("""
                    INSERT INTO chat_sessions (id, user_id, subject_id, created_at, updated_at)
                    VALUES (?, ?, ?, NOW(), NOW())
                    """, sessionId, userId, request.subjectId());
        }

        List<SimilaritySearchResponse> allChunks = search(userId, request.question(), request.subjectId(), 5);
        List<SimilaritySearchResponse> chunks = allChunks.stream()
                .filter(c -> c.distance() <= RELEVANCE_THRESHOLD)
                .toList();

        String context = chunks.isEmpty()
                ? "(No relevant lecture notes found for this question)"
                : chunks.stream()
                        .map(SimilaritySearchResponse::content)
                        .collect(Collectors.joining("\n---\n"));

        String prompt = """
                You are a study assistant. Based on the following lecture notes,
                answer the student's question concisely and accurately.
                If the information is not sufficient to answer, clearly state that no relevant
                information was found; do not fabricate an answer. Answer in the same language as the question.

                === LECTURE NOTES ===
                %s

                === QUESTION ===
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
                        "/api/media/" + c.mediaId() + "/image",
                        c.distance()))
                .collect(Collectors.toList());

        if (isNewSession) {
            generateSessionTitle(request.question(), sessionId);
        }

        return new ChatMessageResponse(sessionId, assistantMessageId, answer, citations);
    }

    public SseEmitter answerStream(UUID userId, ChatRequest request) {
        SseEmitter emitter = new SseEmitter(180_000L);
        streamExecutor.execute(() -> processAnswerStream(userId, request, emitter));
        return emitter;
    }

    private void processAnswerStream(UUID userId, ChatRequest request, SseEmitter emitter) {
        AtomicBoolean isAborted = new AtomicBoolean(false);
        emitter.onCompletion(() -> log.debug("SSE stream completed"));
        emitter.onTimeout(() -> {
            log.warn("SSE stream timeout");
            isAborted.set(true);
            emitter.complete();
        });
        emitter.onError(t -> {
            log.warn("SSE stream error/disconnect: {}", t.getMessage());
            isAborted.set(true);
        });

        UUID sessionId = request.sessionId();
        boolean isNewSession = false;
        if (sessionId == null) {
            isNewSession = true;
            sessionId = UUID.randomUUID();
            jdbcTemplate.update("""
                    INSERT INTO chat_sessions (id, user_id, subject_id, created_at, updated_at)
                    VALUES (?, ?, ?, NOW(), NOW())
                    """, sessionId, userId, request.subjectId());
        }

        UUID finalSessionId = sessionId;
        boolean finalIsNewSession = isNewSession;

        try {
            List<SimilaritySearchResponse> allChunks = search(userId, request.question(), request.subjectId(), 5);
            List<SimilaritySearchResponse> chunks = allChunks.stream()
                    .filter(c -> c.distance() <= RELEVANCE_THRESHOLD)
                    .toList();

            UUID userMessageId = UUID.randomUUID();
            jdbcTemplate.update("""
                    INSERT INTO chat_messages (id, session_id, role, content, created_at)
                    VALUES (?, ?, 'user', ?, NOW())
                    """, userMessageId, finalSessionId, request.question());

            UUID assistantMessageId = UUID.randomUUID();
            List<CitationResponse> citations = chunks.stream()
                    .map(c -> new CitationResponse(
                            c.chunkId(),
                            c.mediaId(),
                            c.fileName(),
                            "/api/media/" + c.mediaId() + "/image",
                            c.distance()))
                    .collect(Collectors.toList());

            if (isAborted.get()) {
                return;
            }

            sendEvent(emitter, "metadata", Map.of(
                    "sessionId", finalSessionId,
                    "messageId", assistantMessageId,
                    "citations", citations
            ));

            String context = chunks.isEmpty()
                    ? "(No relevant lecture notes found for this question)"
                    : chunks.stream()
                            .map(SimilaritySearchResponse::content)
                            .collect(Collectors.joining("\n---\n"));

            String prompt = """
                    You are a study assistant. Based on the following lecture notes,
                    answer the student's question concisely and accurately.
                    If the information is not sufficient to answer, clearly state that no relevant
                    information was found; do not fabricate an answer. Answer in the same language as the question.

                    === LECTURE NOTES ===
                    %s

                    === QUESTION ===
                    %s
                    """.formatted(context, request.question());

            StringBuilder fullContent = new StringBuilder();

            llmProvider.streamAnswer(
                    prompt,
                    chunk -> {
                        if (isAborted.get()) {
                            return;
                        }
                        fullContent.append(chunk);
                        try {
                            sendEvent(emitter, "delta", Map.of("text", chunk));
                        } catch (Exception e) {
                            log.warn("Failed to send delta SSE: {}", e.getMessage());
                            isAborted.set(true);
                        }
                    },
                    () -> {
                        String answer = fullContent.toString();
                        try {
                            jdbcTemplate.update("""
                                    INSERT INTO chat_messages (id, session_id, role, content, created_at)
                                    VALUES (?, ?, 'assistant', ?, NOW())
                                    """, assistantMessageId, finalSessionId, answer);

                            for (SimilaritySearchResponse chunk : chunks) {
                                jdbcTemplate.update("""
                                        INSERT INTO message_citations (id, message_id, chunk_id, media_id, similarity_score)
                                        VALUES (?, ?, ?, ?, ?)
                                        """, UUID.randomUUID(), assistantMessageId, chunk.chunkId(), chunk.mediaId(),
                                        (float) chunk.distance());
                            }

                            if (finalIsNewSession) {
                                generateSessionTitle(request.question(), finalSessionId);
                            }
                        } catch (Exception e) {
                            log.error("Failed to persist assistant message/citations", e);
                        }

                        if (!isAborted.get()) {
                            try {
                                sendEvent(emitter, "done", Map.of("fullContent", answer));
                                emitter.complete();
                            } catch (Exception e) {
                                log.warn("Failed to send done event: {}", e.getMessage());
                            }
                        }
                    },
                    throwable -> {
                        log.error("LLM streaming error: {}", throwable.getMessage());
                        if (!isAborted.get()) {
                            try {
                                sendEvent(emitter, "error", Map.of("message", "AI server is busy. Please try again."));
                            } catch (Exception ignored) {
                            }
                            emitter.complete();
                        }
                    }
            );
        } catch (Exception e) {
            log.error("Exception in stream setup", e);
            if (!isAborted.get()) {
                try {
                    sendEvent(emitter, "error", Map.of("message", "System error while processing the question."));
                } catch (Exception ignored) {
                }
                emitter.complete();
            }
        }
    }

    private void sendEvent(SseEmitter emitter, String eventName, Object data) throws Exception {
        String json = data instanceof String ? (String) data : objectMapper.writeValueAsString(data);
        emitter.send(SseEmitter.event().name(eventName).data(json));
    }

    private void generateSessionTitle(String question, UUID sessionId) {
        try {
            String titlePrompt = "Summarize the following question into a short title (maximum 5-6 words, only return the title without quotes or punctuation): " + question;
            String generatedTitle = llmProvider.generateAnswer(titlePrompt).trim();
            // Remove quotation marks if LLM wraps the title in quotes
            if (generatedTitle.startsWith("\"") && generatedTitle.endsWith("\"")) {
                generatedTitle = generatedTitle.substring(1, generatedTitle.length() - 1);
            }
            if (generatedTitle.length() > 50) {
                generatedTitle = generatedTitle.substring(0, 47) + "...";
            }
            jdbcTemplate.update("UPDATE chat_sessions SET title = ? WHERE id = ?", generatedTitle, sessionId);
        } catch (Exception e) {
            // Ignore title generation errors to not fail the chat response
        }
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
            throw new IllegalArgumentException("Session not found or does not belong to this user");
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
                "/api/media/" + rs.getString("media_id") + "/image",
                rs.getDouble("similarity_score")), messageId);
    }

    /**
     * Renames a chat session title. Validates that the session belongs to the requesting user.
     *
     * @param userId    the authenticated user
     * @param sessionId the session to rename
     * @param newTitle  new title (blank → stored as null to reset to auto-title)
     */
    @Transactional
    public void renameSession(UUID userId, UUID sessionId, String newTitle) {
        String ownerCheckSql = "SELECT COUNT(*) FROM chat_sessions WHERE id = ? AND user_id = ?";
        Integer count = jdbcTemplate.queryForObject(ownerCheckSql, Integer.class, sessionId, userId);
        if (count == null || count == 0) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Session not found or does not belong to this user");
        }

        String trimmed = (newTitle == null || newTitle.isBlank()) ? null : newTitle.trim();
        jdbcTemplate.update(
                "UPDATE chat_sessions SET title = ?, updated_at = NOW() WHERE id = ?",
                trimmed, sessionId);
    }
}
