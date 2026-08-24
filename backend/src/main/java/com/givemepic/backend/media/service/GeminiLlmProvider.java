package com.givemepic.backend.media.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Service
public class GeminiLlmProvider implements LlmProvider {

    private static final Logger log = LoggerFactory.getLogger(GeminiLlmProvider.class);

    private static final int MAX_RETRIES = 3;
    private static final long BASE_DELAY_MS = 1_000L;

    private final RestClient restClient;
    private final String apiKey;
    private final String model;

    @Autowired
    public GeminiLlmProvider(
            RestClient.Builder restClientBuilder,
            @Value("${app.chat.gemini-api-key:}") String apiKey,
            @Value("${app.chat.model:gemini-2.5-flash-lite}") String model) {
        this(restClientBuilder
                .baseUrl("https://generativelanguage.googleapis.com/v1beta")
                .build(), apiKey, model);
    }

    GeminiLlmProvider(RestClient restClient, String apiKey, String model) {
        this.restClient = restClient;
        this.apiKey = apiKey;
        this.model = model;
    }

    @Override
    public String modelName() {
        return model;
    }

    @Override
    @SuppressWarnings("unchecked")
    public String generateAnswer(String prompt) {
        if (apiKey.isBlank()) {
            throw new IllegalStateException("Chưa cấu hình GEMINI_API_KEY");
        }

        HttpClientErrorException lastException = null;
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return doGenerate(prompt);
            } catch (HttpClientErrorException e) {
                if (e.getStatusCode().value() != 429) {
                    throw e;
                }
                lastException = e;
                long delayMs = resolveDelay(e, attempt);
                log.warn("Gemini chat 429 (attempt {}/{}), retrying in {}ms", attempt + 1, MAX_RETRIES, delayMs);
                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("Chat completion interrupted during backoff", ie);
                }
            }
        }
        throw new IllegalStateException("Gemini chat vẫn trả 429 sau " + MAX_RETRIES + " lần retry", lastException);
    }

    private String doGenerate(String prompt) {
        Map<String, Object> response = restClient.post()
                .uri(uriBuilder -> uriBuilder
                        .path("/models/{model}:generateContent")
                        .queryParam("key", apiKey)
                        .build(model))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                        "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt))))))
                .retrieve()
                .body(Map.class);

        List<Map<String, Object>> candidates = (List<Map<String, Object>>) response.get("candidates");
        if (candidates == null || candidates.isEmpty()) {
            throw new IllegalStateException("Gemini không trả về candidate nào: " + response);
        }
        Map<String, Object> content = (Map<String, Object>) candidates.get(0).get("content");
        List<Map<String, Object>> parts = (List<Map<String, Object>>) content.get("parts");
        return (String) parts.get(0).get("text");
    }

    private long resolveDelay(HttpClientErrorException e, int attempt) {
        String retryAfterHeader = e.getResponseHeaders() != null
                ? e.getResponseHeaders().getFirst("Retry-After")
                : null;
        if (retryAfterHeader != null) {
            try {
                return Long.parseLong(retryAfterHeader.trim()) * 1_000L;
            } catch (NumberFormatException ignored) {
            }
        }
        return BASE_DELAY_MS * (1L << attempt);
    }
}