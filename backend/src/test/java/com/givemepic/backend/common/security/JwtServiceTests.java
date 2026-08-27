package com.givemepic.backend.common.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class JwtServiceTests {

    private JwtService jwtService;
    private final String secret = "this-is-a-very-long-secret-key-for-testing-purposes-only";
    private final long expirationMs = 3600000; // 1 hour

    @BeforeEach
    void setUp() {
        jwtService = new JwtService(secret, expirationMs);
    }

    @Test
    void generateAndExtractToken_Success() {
        UUID userId = UUID.randomUUID();
        String email = "test@example.com";

        String token = jwtService.generateAccessToken(userId, email);

        assertThat(token).isNotBlank();
        
        UUID extractedId = jwtService.extractUserId(token);
        assertThat(extractedId).isEqualTo(userId);
        
        boolean isValid = jwtService.isTokenValid(token);
        assertThat(isValid).isTrue();
    }

    @Test
    void isTokenValid_ReturnsFalseForInvalidToken() {
        String invalidToken = "invalid.token.string";
        boolean isValid = jwtService.isTokenValid(invalidToken);
        assertThat(isValid).isFalse();
    }
    
    @Test
    void isTokenValid_ReturnsFalseForWrongSignature() {
        JwtService differentJwtService = new JwtService("another-completely-different-secret-key-for-testing", expirationMs);
        String tokenFromDifferentService = differentJwtService.generateAccessToken(UUID.randomUUID(), "test@example.com");
        
        boolean isValid = jwtService.isTokenValid(tokenFromDifferentService);
        assertThat(isValid).isFalse();
    }
}
