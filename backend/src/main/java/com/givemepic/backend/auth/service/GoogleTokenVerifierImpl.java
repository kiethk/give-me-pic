package com.givemepic.backend.auth.service;

import com.givemepic.backend.auth.dto.GoogleTokenPayload;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

@Slf4j
@Component
public class GoogleTokenVerifierImpl implements GoogleTokenVerifier {

    private final RestClient restClient;
    private final String expectedClientId;

    @Autowired
    public GoogleTokenVerifierImpl(
            RestClient.Builder restClientBuilder,
            @Value("${app.auth.google.client-id:}") String expectedClientId) {
        this(restClientBuilder.baseUrl("https://oauth2.googleapis.com").build(), expectedClientId);
    }

    GoogleTokenVerifierImpl(RestClient restClient, String expectedClientId) {
        this.restClient = restClient;
        this.expectedClientId = expectedClientId;
    }

    @Override
    public GoogleTokenPayload verify(String idToken) {
        if (!StringUtils.hasText(idToken)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID token must not be blank");
        }

        GoogleTokenPayload payload;
        try {
            payload = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/tokeninfo")
                            .queryParam("id_token", idToken)
                            .build())
                    .retrieve()
                    .body(GoogleTokenPayload.class);
        } catch (Exception e) {
            log.warn("Failed to verify Google ID token: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google ID token is invalid or has expired");
        }

        if (payload == null || !StringUtils.hasText(payload.sub()) || !StringUtils.hasText(payload.email())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google token contains invalid payload");
        }

        if (!payload.isEmailVerified()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google email is not verified");
        }

        if (!StringUtils.hasText(payload.iss())
                || (!"accounts.google.com".equals(payload.iss()) && !"https://accounts.google.com".equals(payload.iss()))) {
            log.warn("Google token invalid issuer: {}", payload.iss());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google token issuer is invalid");
        }

        String trimmedExpectedClientId = StringUtils.hasText(expectedClientId) ? expectedClientId.trim() : null;
        if (StringUtils.hasText(trimmedExpectedClientId) && !trimmedExpectedClientId.equals(payload.aud())) {
            log.warn("Google token audience mismatch: expected {} but got {}", trimmedExpectedClientId, payload.aud());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google token does not belong to this application");
        }

        return payload;
    }
}
