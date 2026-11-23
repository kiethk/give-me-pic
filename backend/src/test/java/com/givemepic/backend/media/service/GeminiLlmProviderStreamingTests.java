package com.givemepic.backend.media.service;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class GeminiLlmProviderStreamingTests {

    @Test
    void streamAnswerParsesSseChunksAndDispatchesToCallbacks() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.build();

        String sseBody = """
                data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}

                data: {"candidates":[{"content":{"parts":[{"text":"world!"}]}}]}

                """;

        server.expect(requestTo("https://example.test/models/gemini-model:streamGenerateContent?alt=sse&key=test-key"))
                .andExpect(method(POST))
                .andRespond(withSuccess(sseBody, MediaType.TEXT_EVENT_STREAM));

        GeminiLlmProvider provider = new GeminiLlmProvider(restClient, "test-key", "gemini-model");

        List<String> chunks = new ArrayList<>();
        AtomicBoolean completed = new AtomicBoolean(false);
        AtomicReference<Throwable> error = new AtomicReference<>();

        provider.streamAnswer(
                "test prompt",
                chunks::add,
                () -> completed.set(true),
                error::set
        );

        server.verify();
        assertEquals(List.of("Hello ", "world!"), chunks);
        assertTrue(completed.get());
        assertNull(error.get());
    }

    @Test
    void streamAnswerDispatchesErrorWhenHttpFails() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.build();

        server.expect(requestTo("https://example.test/models/gemini-model:streamGenerateContent?alt=sse&key=test-key"))
                .andExpect(method(POST))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        GeminiLlmProvider provider = new GeminiLlmProvider(restClient, "test-key", "gemini-model");

        List<String> chunks = new ArrayList<>();
        AtomicBoolean completed = new AtomicBoolean(false);
        AtomicReference<Throwable> error = new AtomicReference<>();

        provider.streamAnswer(
                "test prompt",
                chunks::add,
                () -> completed.set(true),
                error::set
        );

        server.verify();
        assertTrue(chunks.isEmpty());
        assertFalse(completed.get());
        assertNotNull(error.get());
    }
}
