package com.givemepic.backend.chat.controller;

import com.givemepic.backend.chat.service.ChatService;
import com.givemepic.backend.media.service.EmbeddingProvider;
import com.givemepic.backend.media.service.LlmProvider;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ChatStreamingControllerTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ChatService chatService;

    @MockitoBean
    private EmbeddingProvider embeddingProvider;

    @MockitoBean
    private LlmProvider llmProvider;

    @Test
    void streamEndpointEmitsEventsAndPersistsData() throws Exception {
        chatService.setStreamExecutor(Runnable::run);

        List<Float> queryVector = Stream.generate(() -> 0.1f)
                .limit(768)
                .toList();

        when(embeddingProvider.embed(anyString())).thenReturn(queryVector);

        doAnswer(invocation -> {
            Consumer<String> onChunk = invocation.getArgument(1);
            Runnable onComplete = invocation.getArgument(2);
            onChunk.accept("B-Tree ");
            onChunk.accept("index");
            onComplete.run();
            return null;
        }).when(llmProvider).streamAnswer(anyString(), any(), any(), any());

        when(llmProvider.generateAnswer(anyString())).thenReturn("B-Tree Index Title");

        // Register a user and get cookie
        String email = "stream-" + UUID.randomUUID() + "@example.com";
        MockHttpServletResponse authResponse = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"password123\",\"displayName\":\"Stream User\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse();

        Cookie accessCookie = authResponse.getCookie("access_token");

        UUID userId = jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, email);

        UUID subjectId = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO subjects (id, user_id, name, color_hex, semester) VALUES (?, ?, ?, ?, ?)",
                subjectId, userId, "Database Systems", "#4F46E5", "Fall 2026");

        UUID mediaId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_files (id, user_id, subject_id, file_name, stored_name, content_type, size_bytes, storage_path, url, ocr_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, mediaId, userId, subjectId, "btree_lecture.png", "stored_btree.png", "image/png", 2048L, "path/btree.png", "http://url", "completed");

        UUID ocrResultId = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO ocr_results (id, media_id, raw_text, confidence_score, ocr_engine) VALUES (?, ?, ?, ?, ?)",
                ocrResultId, mediaId, "B-Tree is a self-balancing tree data structure...", 0.98f, "tesseract");

        UUID chunkId = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO document_chunks (id, media_id, ocr_result_id, chunk_index, content) VALUES (?, ?, ?, ?, ?)",
                chunkId, mediaId, ocrResultId, 0, "B-Tree is a self-balancing tree data structure...");

        String vectorLiteral = queryVector.stream().map(String::valueOf).collect(Collectors.joining(",", "[", "]"));
        jdbcTemplate.update("INSERT INTO chunk_embeddings (id, chunk_id, embedding, model_name) VALUES (gen_random_uuid(), ?, ?::vector, ?)",
                chunkId, vectorLiteral, "gemini-embedding-001");

        // Execute streaming endpoint
        String requestJson = "{\"question\":\"How does B-Tree work?\",\"subjectId\":\"" + subjectId + "\"}";
        MvcResult mvcResult = mockMvc.perform(post("/api/chat/stream")
                        .cookie(accessCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestJson))
                .andExpect(request().asyncStarted())
                .andReturn();

        // Wait for async execution
        mockMvc.perform(asyncDispatch(mvcResult))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM));

        String responseBody = mvcResult.getResponse().getContentAsString();

        // Verify SSE format and contents
        assertTrue(responseBody.contains("event:metadata"), "Response should contain metadata event");
        assertTrue(responseBody.contains("btree_lecture.png"), "Metadata should include citations");
        assertTrue(responseBody.contains("event:delta"), "Response should contain delta events");
        assertTrue(responseBody.contains("B-Tree "), "Delta should contain first chunk");
        assertTrue(responseBody.contains("index"), "Delta should contain second chunk");
        assertTrue(responseBody.contains("event:done"), "Response should contain done event");
        assertTrue(responseBody.contains("B-Tree index"), "Done event should contain accumulated full text");

        // Verify database persistence
        Integer messageCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM chat_messages cm
                JOIN chat_sessions cs ON cm.session_id = cs.id
                WHERE cs.user_id = ? AND cm.content = 'B-Tree index' AND cm.role = 'assistant'
                """,
                Integer.class, userId);
        assertEquals(1, messageCount);

        Integer citationCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM message_citations WHERE chunk_id = ?",
                Integer.class, chunkId);
        assertEquals(1, citationCount);
    }

    @Test
    void existingPostChatEndpointWorksBackwardCompatibility() throws Exception {
        List<Float> queryVector = Stream.generate(() -> 0.1f)
                .limit(768)
                .toList();

        when(embeddingProvider.embed(anyString())).thenReturn(queryVector);
        when(llmProvider.generateAnswer(anyString())).thenReturn("Non-streaming answer");

        String email = "compat-" + UUID.randomUUID() + "@example.com";
        MockHttpServletResponse authResponse = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"password123\",\"displayName\":\"Compat User\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse();

        Cookie accessCookie = authResponse.getCookie("access_token");
        UUID userId = jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, email);

        String requestJson = "{\"question\":\"What is backward compatibility?\"}";
        mockMvc.perform(post("/api/chat")
                        .cookie(accessCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestJson))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionId").isNotEmpty())
                .andExpect(jsonPath("$.messageId").isNotEmpty())
                .andExpect(jsonPath("$.answer").value("Non-streaming answer"));
    }
}
