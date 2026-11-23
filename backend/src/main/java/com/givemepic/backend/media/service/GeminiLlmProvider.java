package com.givemepic.backend.media.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

@Service
public class GeminiLlmProvider implements LlmProvider {

    private static final Logger log = LoggerFactory.getLogger(GeminiLlmProvider.class);

    private static final int MAX_RETRIES = 3;
    private static final long BASE_DELAY_MS = 1_000L;

    private final RestClient restClient;
    private final String apiKey;
    private final String model;
    private final ObjectMapper objectMapper;

    @Autowired
    public GeminiLlmProvider(
            RestClient.Builder restClientBuilder,
            @Value("${app.chat.gemini-api-key:}") String apiKey,
            @Value("${app.chat.model:gemini-2.5-flash-lite}") String model) {
        this(restClientBuilder
                .baseUrl("https://generativelanguage.googleapis.com/v1beta")
                .build(), apiKey, model, new ObjectMapper());
    }

    GeminiLlmProvider(RestClient restClient, String apiKey, String model) {
        this(restClient, apiKey, model, new ObjectMapper());
    }

    GeminiLlmProvider(RestClient restClient, String apiKey, String model, ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.apiKey = apiKey;
        this.model = model;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
    }

    @Override
    public String modelName() {
        return model;
    }

    @Override
    @SuppressWarnings("unchecked")
    public String generateAnswer(String prompt) {
        if (apiKey.isBlank()) {
            throw new IllegalStateException("GEMINI_API_KEY is not configured");
        }

        HttpClientErrorException lastException = null;
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return doGenerate(prompt);
            } catch (HttpClientErrorException e) {
                int status = e.getStatusCode().value();
                if (status != 429 && status != 503 && status != 502 && status != 504) {
                    throw e;
                }
                lastException = e;
                long delayMs = resolveDelay(e, attempt);
                log.warn("Gemini chat HTTP {} (attempt {}/{}), retrying in {}ms", status, attempt + 1, MAX_RETRIES, delayMs);
                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("Chat completion interrupted during backoff", ie);
                }
            }
        }
        throw new IllegalStateException("Gemini chat failed after " + MAX_RETRIES + " retries", lastException);
    }

    @Override
    public void streamAnswer(String prompt, Consumer<String> onChunk, Runnable onComplete, Consumer<Throwable> onError) {
        if (apiKey.isBlank()) {
            onError.accept(new IllegalStateException("GEMINI_API_KEY is not configured"));
            return;
        }

        HttpClientErrorException lastException = null;
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                restClient.post()
                        .uri(uriBuilder -> uriBuilder
                                .path("/models/{model}:streamGenerateContent")
                                .queryParam("alt", "sse")
                                .queryParam("key", apiKey)
                                .build(model))
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of(
                                "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt))))))
                        .exchange((request, response) -> {
                            if (response.getStatusCode().isError()) {
                                throw new HttpClientErrorException(response.getStatusCode(), response.getStatusText());
                            }
                            try (BufferedReader reader = new BufferedReader(
                                    new InputStreamReader(response.getBody(), StandardCharsets.UTF_8))) {
                                String line;
                                while ((line = reader.readLine()) != null) {
                                    line = line.trim();
                                    if (line.startsWith("data:")) {
                                        String json = line.substring(5).trim();
                                        if (!json.isEmpty()) {
                                            dispatchSseChunk(json, onChunk);
                                        }
                                    }
                                }
                            }
                            return null;
                        });
                onComplete.run();
                return;
            } catch (HttpClientErrorException e) {
                int status = e.getStatusCode().value();
                if (status != 429 && status != 503 && status != 502 && status != 504) {
                    log.error("Gemini stream non-retryable error ({}): {}", status, e.getMessage());
                    onError.accept(e);
                    return;
                }
                lastException = e;
                long delayMs = resolveDelay(e, attempt);
                log.warn("Gemini stream HTTP {} (attempt {}/{}), retrying in {}ms...", status, attempt + 1, MAX_RETRIES, delayMs);
                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    onError.accept(ie);
                    return;
                }
            } catch (Throwable t) {
                log.error("Gemini stream unexpected error: {}", t.getMessage(), t);
                onError.accept(t);
                return;
            }
        }
        onError.accept(new IllegalStateException("Gemini stream failed after " + MAX_RETRIES + " retries", lastException));
    }

    private void dispatchSseChunk(String json, Consumer<String> onChunk) throws JsonProcessingException {
        JsonNode root = objectMapper.readTree(json);
        JsonNode candidates = root.path("candidates");
        if (candidates.isArray()) {
            for (JsonNode candidate : candidates) {
                JsonNode parts = candidate.path("content").path("parts");
                if (parts.isArray()) {
                    for (JsonNode part : parts) {
                        if (part.has("text")) {
                            String text = part.path("text").asText();
                            if (text != null && !text.isEmpty()) {
                                onChunk.accept(text);
                            }
                        }
                    }
                }
            }
        }
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
            throw new IllegalStateException("Gemini returned no candidates: " + response);
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