package com.givemepic.backend.auth.controller;

import com.givemepic.backend.auth.dto.AuthResponse;
import com.givemepic.backend.auth.dto.LoginRequest;
import com.givemepic.backend.auth.dto.RegisterRequest;
import com.givemepic.backend.auth.dto.UpdateProfileRequest;
import com.givemepic.backend.auth.dto.UserProfileResponse;
import com.givemepic.backend.auth.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @Value("${app.cookie-secure:false}")
    private boolean cookieSecure;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return withAuthCookies(authService.register(request), HttpStatus.CREATED);
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return withAuthCookies(authService.login(request), HttpStatus.OK);
        }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> me(@AuthenticationPrincipal UUID userId) {
        return ResponseEntity.ok(authService.getProfile(userId));
    }

    @PatchMapping("/me")
    public ResponseEntity<UserProfileResponse> updateProfile(
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody UpdateProfileRequest request) {
        return ResponseEntity.ok(authService.updateProfile(userId, request));
    }

    @PostMapping("/avatar")
    public ResponseEntity<UserProfileResponse> uploadAvatar(
            @AuthenticationPrincipal UUID userId,
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        return ResponseEntity.ok(authService.uploadAvatar(userId, file));
    }

        @PostMapping("/logout")
        public ResponseEntity<Void> logout() {
        ResponseCookie accessCookie = ResponseCookie.from("access_token", "")
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite("Lax")
            .path("/")
            .maxAge(0)
            .build();
        ResponseCookie refreshCookie = ResponseCookie.from("refresh_token", "")
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite("Lax")
            .path("/api/auth")
            .maxAge(0)
            .build();

        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, accessCookie.toString())
            .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
            .build();
        }

        private ResponseEntity<AuthResponse> withAuthCookies(AuthResponse response, HttpStatus status) {
        ResponseCookie accessCookie = ResponseCookie.from("access_token", response.accessToken())
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite("Lax")
            .path("/")
            .maxAge(900)
            .build();
        ResponseCookie refreshCookie = ResponseCookie.from("refresh_token", response.refreshToken())
            .httpOnly(true)
            .secure(cookieSecure)
            .sameSite("Lax")
            .path("/api/auth")
            .maxAge(604800)
            .build();

        return ResponseEntity.status(status)
            .header(HttpHeaders.SET_COOKIE, accessCookie.toString())
            .header(HttpHeaders.SET_COOKIE, refreshCookie.toString())
            .body(response);
    }
}
