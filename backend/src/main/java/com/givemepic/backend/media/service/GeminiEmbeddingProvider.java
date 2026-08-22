package com.givemepic.backend.media.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Service
public class GeminiEmbeddingProvider implements EmbeddingProvider {

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
}
