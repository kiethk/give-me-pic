package com.givemepic.backend.chat.controller;

import com.givemepic.backend.media.service.EmbeddingProvider;
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

import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ChatControllerIntegrationTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private EmbeddingProvider embeddingProvider;

    @Test
    void similaritySearchReturnsCorrectResults() throws Exception {
        // Mock embedding provider to return a vector of size 768
        List<Float> queryVector = Stream.generate(() -> 0.1f)
                .limit(768)
                .toList();

        when(embeddingProvider.embed(anyString())).thenReturn(queryVector);

        // Register a user and get cookie
        String email = "chat-" + UUID.randomUUID() + "@example.com";
        MockHttpServletResponse authResponse = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"password123\",\"displayName\":\"Chat User\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse();

        Cookie accessCookie = authResponse.getCookie("access_token");

        // Extract user_id from database
        UUID userId = jdbcTemplate.queryForObject("SELECT id FROM users WHERE email = ?", UUID.class, email);

        // Create a subject
        UUID subjectId = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO subjects (id, user_id, name, color_hex, semester) VALUES (?, ?, ?, ?, ?)",
                subjectId, userId, "Math 101", "#4F46E5", "Fall 2026");

        // Insert media file
        UUID mediaId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO media_files (id, user_id, subject_id, file_name, stored_name, content_type, size_bytes, storage_path, url, ocr_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, mediaId, userId, subjectId, "lecture1.png", "stored1.png", "image/png", 1024L, "path/1.png", "http://url", "completed");

        // Insert OCR result
        UUID ocrResultId = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO ocr_results (id, media_id, raw_text, confidence_score, ocr_engine) VALUES (?, ?, ?, ?, ?)",
                ocrResultId, mediaId, "Newton's first law states that an object remains in a state of rest...", 0.95f, "tesseract");

        // Insert document chunk
        UUID chunkId = UUID.randomUUID();
        jdbcTemplate.update("INSERT INTO document_chunks (id, media_id, ocr_result_id, chunk_index, content) VALUES (?, ?, ?, ?, ?)",
                chunkId, mediaId, ocrResultId, 0, "Newton's first law states that an object remains in a state of rest...");

        // Insert chunk embedding
        String vectorLiteral = queryVector.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(",", "[", "]"));
        jdbcTemplate.update("INSERT INTO chunk_embeddings (id, chunk_id, embedding, model_name) VALUES (gen_random_uuid(), ?, ?::vector, ?)",
                chunkId, vectorLiteral, "gemini-embedding-001");

        // Perform similarity search (unfiltered by subject)
        mockMvc.perform(get("/api/chat/similarity-search")
                        .cookie(accessCookie)
                        .param("query", "Newton's first law")
                        .param("limit", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].chunkId").value(chunkId.toString()))
                .andExpect(jsonPath("$[0].mediaId").value(mediaId.toString()))
                .andExpect(jsonPath("$[0].fileName").value("lecture1.png"))
                .andExpect(jsonPath("$[0].content").value("Newton's first law states that an object remains in a state of rest..."))
                .andExpect(jsonPath("$[0].distance").isNumber());

        // Perform similarity search with incorrect subject filter
        UUID otherSubjectId = UUID.randomUUID();
        mockMvc.perform(get("/api/chat/similarity-search")
                        .cookie(accessCookie)
                        .param("query", "Newton's first law")
                        .param("subjectId", otherSubjectId.toString())
                        .param("limit", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());

        // Perform similarity search with correct subject filter
        mockMvc.perform(get("/api/chat/similarity-search")
                        .cookie(accessCookie)
                        .param("query", "Newton's first law")
                        .param("subjectId", subjectId.toString())
                        .param("limit", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].chunkId").value(chunkId.toString()));
    }
}
