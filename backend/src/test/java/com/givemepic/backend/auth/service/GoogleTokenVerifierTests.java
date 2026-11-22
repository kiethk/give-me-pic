package com.givemepic.backend.auth.service;

import com.givemepic.backend.auth.dto.GoogleTokenPayload;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GoogleTokenVerifierTests {

    @Mock
    private RestClient restClient;

    @Mock
    private RestClient.RequestHeadersUriSpec requestHeadersUriSpec;

    @Mock
    private RestClient.ResponseSpec responseSpec;

    @Test
    void verify_ThrowsBadRequest_WhenIdTokenIsEmpty() {
        GoogleTokenVerifierImpl verifier = new GoogleTokenVerifierImpl(restClient, "client-id");

        assertThatThrownBy(() -> verifier.verify(""))
                .isInstanceOf(ResponseStatusException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.BAD_REQUEST)
                .hasMessageContaining("ID token không được để trống");
    }

    @Test
    void verify_ThrowsUnauthorized_WhenRestClientThrows() {
        GoogleTokenVerifierImpl verifier = new GoogleTokenVerifierImpl(restClient, "client-id");

        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(Function.class))).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.retrieve()).thenThrow(new RuntimeException("Network error"));

        assertThatThrownBy(() -> verifier.verify("some-token"))
                .isInstanceOf(ResponseStatusException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.UNAUTHORIZED)
                .hasMessageContaining("Google ID token không hợp lệ hoặc đã hết hạn");
    }

    @Test
    void verify_ThrowsUnauthorized_WhenEmailNotVerified() {
        GoogleTokenVerifierImpl verifier = new GoogleTokenVerifierImpl(restClient, "client-id");

        GoogleTokenPayload payload = new GoogleTokenPayload(
                "sub-1",
                "test@example.com",
                "false",
                "Test",
                null,
                "client-id",
                "https://accounts.google.com"
        );

        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(Function.class))).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(GoogleTokenPayload.class)).thenReturn(payload);

        assertThatThrownBy(() -> verifier.verify("some-token"))
                .isInstanceOf(ResponseStatusException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.UNAUTHORIZED)
                .hasMessageContaining("Email Google chưa được xác thực");
    }

    @Test
    void verify_ThrowsUnauthorized_WhenAudienceMismatch() {
        GoogleTokenVerifierImpl verifier = new GoogleTokenVerifierImpl(restClient, "expected-client-id");

        GoogleTokenPayload payload = new GoogleTokenPayload(
                "sub-1",
                "test@example.com",
                "true",
                "Test",
                null,
                "different-client-id",
                "https://accounts.google.com"
        );

        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(Function.class))).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(GoogleTokenPayload.class)).thenReturn(payload);

        assertThatThrownBy(() -> verifier.verify("some-token"))
                .isInstanceOf(ResponseStatusException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.UNAUTHORIZED)
                .hasMessageContaining("Google token không thuộc về ứng dụng này");
    }

    @Test
    void verify_ThrowsUnauthorized_WhenIssuerIsInvalid() {
        GoogleTokenVerifierImpl verifier = new GoogleTokenVerifierImpl(restClient, "expected-client-id");

        GoogleTokenPayload payload = new GoogleTokenPayload(
                "sub-1",
                "test@example.com",
                "true",
                "Test",
                null,
                "expected-client-id",
                "https://malicious-issuer.com"
        );

        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(Function.class))).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(GoogleTokenPayload.class)).thenReturn(payload);

        assertThatThrownBy(() -> verifier.verify("some-token"))
                .isInstanceOf(ResponseStatusException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.UNAUTHORIZED)
                .hasMessageContaining("Issuer của Google token không hợp lệ");
    }

    @Test
    void verify_Success_WhenAudienceMatchesWithUntrimmedConfig() {
        GoogleTokenVerifierImpl verifier = new GoogleTokenVerifierImpl(restClient, "  expected-client-id  ");

        GoogleTokenPayload payload = new GoogleTokenPayload(
                "sub-1",
                "test@example.com",
                "true",
                "Test User",
                "https://pic.jpg",
                "expected-client-id",
                "https://accounts.google.com"
        );

        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(Function.class))).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(GoogleTokenPayload.class)).thenReturn(payload);

        GoogleTokenPayload result = verifier.verify("valid-token");

        assertThat(result).isNotNull();
        assertThat(result.email()).isEqualTo("test@example.com");
    }

    @Test
    void verify_Success_WhenAudienceMatches() {
        GoogleTokenVerifierImpl verifier = new GoogleTokenVerifierImpl(restClient, "expected-client-id");

        GoogleTokenPayload payload = new GoogleTokenPayload(
                "sub-1",
                "test@example.com",
                "true",
                "Test User",
                "https://pic.jpg",
                "expected-client-id",
                "https://accounts.google.com"
        );

        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(Function.class))).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(GoogleTokenPayload.class)).thenReturn(payload);

        GoogleTokenPayload result = verifier.verify("valid-token");

        assertThat(result).isNotNull();
        assertThat(result.email()).isEqualTo("test@example.com");
        assertThat(result.sub()).isEqualTo("sub-1");
    }

    @Test
    void verify_Success_WhenExpectedClientIdIsBlank() {
        // Dev environment where client-id is not yet configured
        GoogleTokenVerifierImpl verifier = new GoogleTokenVerifierImpl(restClient, "");

        GoogleTokenPayload payload = new GoogleTokenPayload(
                "sub-1",
                "test@example.com",
                "true",
                "Test User",
                null,
                "any-client-id",
                "https://accounts.google.com"
        );

        when(restClient.get()).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.uri(any(Function.class))).thenReturn(requestHeadersUriSpec);
        when(requestHeadersUriSpec.retrieve()).thenReturn(responseSpec);
        when(responseSpec.body(GoogleTokenPayload.class)).thenReturn(payload);

        GoogleTokenPayload result = verifier.verify("valid-token");

        assertThat(result).isNotNull();
        assertThat(result.email()).isEqualTo("test@example.com");
    }
}
