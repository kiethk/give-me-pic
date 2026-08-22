package com.givemepic.backend.media.service;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class GeminiEmbeddingProviderTests {

    @Test
    void embedParsesGeminiVectorAndSendsConfirmedDimension() {
        RestClient.Builder restClientBuilder = RestClient.builder().baseUrl("https://example.test");
        MockRestServiceServer server = MockRestServiceServer.bindTo(restClientBuilder).build();
        RestClient restClient = restClientBuilder.build();
        String values = IntStream.range(0, 768)
            .mapToObj(index -> "0.1")
            .collect(Collectors.joining(","));
        server.expect(requestTo("https://example.test/models/gemini-embedding-001:embedContent?key=test-key"))
                .andExpect(method(POST))
                .andExpect(content().json("{\"content\":{\"parts\":[{\"text\":\"hello\"}]},\"outputDimensionality\":768}"))
            .andRespond(withSuccess("{\"embedding\":{\"values\":[" + values + "]}}", APPLICATION_JSON));

        GeminiEmbeddingProvider provider = new GeminiEmbeddingProvider(restClient, "test-key", "gemini-embedding-001", 768);

        assertEquals(768, provider.embed("hello").size());
        server.verify();
    }
}
