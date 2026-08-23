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
public class GeminiEmbeddingProvider implements EmbeddingProvider {

    private static final Logger log = LoggerFactory.getLogger(GeminiEmbeddingProvider.class);

    private static final int MAX_RETRIES = 3;
    private static final long BASE_DELAY_MS = 1_000L;

    private final RestClient restClient;
    private final String apiKey;
    private final String model;
    private final int outputDimensionality;

    @Autowired
    public GeminiEmbeddingProvider(
            RestClient.Builder restClientBuilder,
            @Value("${app.embedding.gemini-api-key:}") String apiKey,
            @Value("${app.embedding.model:gemini-embedding-001}") String model,
            @Value("${app.embedding.output-dimensionality:768}") int outputDimensionality) {
        this(restClientBuilder
                .baseUrl("https://generativelanguage.googleapis.com/v1beta")
                .build(), apiKey, model, outputDimensionality);
    }

    GeminiEmbeddingProvider(RestClient restClient, String apiKey, String model, int outputDimensionality) {
        this.restClient = restClient;
        this.apiKey = apiKey;
        this.model = model;
        this.outputDimensionality = outputDimensionality;
    }

    @Override
    public String modelName() {
        return model;
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<Float> embed(String text) {
        if (apiKey.isBlank()) {
            throw new IllegalStateException("Chưa cấu hình GEMINI_API_KEY");
        }

        HttpClientErrorException lastException = null;
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return doEmbed(text);
            } catch (HttpClientErrorException e) {
                if (e.getStatusCode().value() != 429) {
                    // Non-rate-limit error — không retry, ném ngay
                    throw e;
                }
                lastException = e;
                long delayMs = resolveDelay(e, attempt);
                log.warn("Gemini embedding 429 (attempt {}/{}), retrying in {}ms", attempt + 1, MAX_RETRIES, delayMs);
                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("Embedding interrupted during backoff", ie);
                }
            }
        }
        throw new IllegalStateException("Gemini embedding vẫn trả 429 sau " + MAX_RETRIES + " lần retry", lastException);
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private List<Float> doEmbed(String text) {
        Map<String, Object> response = restClient.post()
                .uri(uriBuilder -> uriBuilder
                        .path("/models/{model}:embedContent")
                        .queryParam("key", apiKey)
                        .build(model))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of(
                        "content", Map.of("parts", List.of(Map.of("text", text))),
                        "outputDimensionality", outputDimensionality))
                .retrieve()
                .body(Map.class);

        Map<String, Object> embedding = (Map<String, Object>) response.get("embedding");
        List<Number> values = (List<Number>) embedding.get("values");
        if (values.size() != outputDimensionality) {
            throw new IllegalStateException("Embedding dimension không đúng: " + values.size());
        }
        return values.stream().map(Number::floatValue).toList();
    }

    /**
     * Reads the {@code Retry-After} header from a 429 response if present;
     * falls back to exponential backoff (1s, 2s, 4s, …) based on attempt index.
     */
    private long resolveDelay(HttpClientErrorException e, int attempt) {
        String retryAfterHeader = e.getResponseHeaders() != null
                ? e.getResponseHeaders().getFirst("Retry-After")
                : null;
        if (retryAfterHeader != null) {
            try {
                return Long.parseLong(retryAfterHeader.trim()) * 1_000L;
            } catch (NumberFormatException ignored) {
                // Header có nhưng không phải số (e.g. HTTP-date) — dùng fallback
            }
        }
        // Exponential backoff: 1s, 2s, 4s
        return BASE_DELAY_MS * (1L << attempt);
    }
}
