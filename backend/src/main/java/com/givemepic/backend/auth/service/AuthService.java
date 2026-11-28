package com.givemepic.backend.auth.service;

import com.givemepic.backend.auth.dto.AuthResponse;
import com.givemepic.backend.auth.dto.GoogleAuthRequest;
import com.givemepic.backend.auth.dto.GoogleTokenPayload;
import com.givemepic.backend.auth.dto.LoginRequest;
import com.givemepic.backend.auth.dto.RegisterRequest;
import com.givemepic.backend.auth.dto.UpdateProfileRequest;
import com.givemepic.backend.auth.dto.UserProfileResponse;
import com.givemepic.backend.auth.dto.UserQuotaSnapshot;
import com.givemepic.backend.auth.entity.RefreshToken;
import com.givemepic.backend.auth.entity.User;
import com.givemepic.backend.auth.repository.RefreshTokenRepository;
import com.givemepic.backend.auth.repository.UserRepository;
import com.givemepic.backend.common.security.JwtService;
import com.givemepic.backend.media.storage.ObjectStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final ObjectStorageService storageService;
    private final GoogleTokenVerifier googleTokenVerifier;

    private static final long REFRESH_TOKEN_EXPIRATION_MS = 604_800_000L; // 7 days

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already in use");
        }

        User user = User.builder()
                .email(request.email())
                .passwordHash(passwordEncoder.encode(request.password()))
                .displayName(request.displayName())
                .build();

        userRepository.save(user);

        return buildAuthResponse(user);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new BadCredentialsException("Invalid email or password"));

        if (user.getPasswordHash() == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BadCredentialsException("Invalid email or password");
        }

        return buildAuthResponse(user);
    }

    @Transactional
    public AuthResponse authenticateWithGoogle(GoogleAuthRequest request) {
        GoogleTokenPayload payload = googleTokenVerifier.verify(request.idToken());

        String email = payload.email() != null ? payload.email().trim().toLowerCase() : "";
        String sub = payload.sub();
        String name = payload.name();
        String picture = payload.picture();

        String safeAvatarUrl = null;
        if (StringUtils.hasText(picture) && picture.trim().length() <= 500) {
            safeAvatarUrl = picture.trim();
        }

        final String avatarUrlToUse = safeAvatarUrl;

        User user = userRepository.findByEmailIgnoreCase(email).map(existingUser -> {
            boolean updated = false;
            if (existingUser.getProviderId() == null || !existingUser.getProviderId().equals(sub)) {
                existingUser.setProviderId(sub);
                existingUser.setProvider("google");
                updated = true;
            }
            if ((existingUser.getAvatarUrl() == null || existingUser.getAvatarUrl().isBlank()) && StringUtils.hasText(avatarUrlToUse)) {
                existingUser.setAvatarUrl(avatarUrlToUse);
                updated = true;
            }
            if (updated) {
                return userRepository.save(existingUser);
            }
            return existingUser;
        }).orElseGet(() -> {
            String rawDisplayName = StringUtils.hasText(name) ? name.trim() : email.split("@")[0];
            String displayName = rawDisplayName.length() > 100 ? rawDisplayName.substring(0, 100) : rawDisplayName;
            User newUser = User.builder()
                    .email(email)
                    .displayName(displayName)
                    .avatarUrl(avatarUrlToUse)
                    .provider("google")
                    .providerId(sub)
                    .passwordHash(null)
                    .build();
            return userRepository.save(newUser);
        });

        return buildAuthResponse(user);
    }

    @Transactional(readOnly = true)
    public UserProfileResponse getProfile(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        return new UserProfileResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getAvatarUrl(), user.getSubscriptionTier());
    }

    @Transactional
    public UserProfileResponse updateProfile(UUID userId, UpdateProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        user.setDisplayName(request.displayName());
        user.setAvatarUrl(request.avatarUrl());
        userRepository.save(user);

        return new UserProfileResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getAvatarUrl(), user.getSubscriptionTier());
    }

    @Transactional
    public UserProfileResponse uploadAvatar(UUID userId, MultipartFile file) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        String extension = StringUtils.getFilenameExtension(file.getOriginalFilename());
        String objectKey = "avatars/" + userId + "/" + UUID.randomUUID() + (extension != null ? "." + extension : "");
        
        storageService.store(objectKey, file);

        // Supabase Storage public URL structure
        // Since we are using endpoint: https://viloijycgivaptvvzaly.storage.supabase.co/storage/v1/s3
        // The public URL is: https://viloijycgivaptvvzaly.supabase.co/storage/v1/object/public/givemepic-media/{objectKey}
        String publicUrl = "https://viloijycgivaptvvzaly.supabase.co/storage/v1/object/public/givemepic-media/" + objectKey;
        
        user.setAvatarUrl(publicUrl);
        userRepository.save(user);

        return new UserProfileResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getAvatarUrl(), user.getSubscriptionTier());
    }

    /**
     * Returns the current subscription tier and storage quota snapshot for a user.
     */
    @Transactional(readOnly = true)
    public UserQuotaSnapshot getQuotaSnapshot(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        return new UserQuotaSnapshot(
                user.getId(),
                user.getSubscriptionTier(),
                user.getStorageQuotaBytes(),
                user.getStorageUsedBytes()
        );
    }

    /**
     * Atomically increments {@code storage_used_bytes} if {@code used + deltaBytes <= quota}.
     */
    @Transactional
    public boolean incrementStorageUsedIfWithinQuota(UUID userId, long deltaBytes) {
        if (deltaBytes < 0) {
            throw new IllegalArgumentException("deltaBytes must be non-negative");
        }
        return userRepository.incrementStorageUsedIfWithinQuota(userId, deltaBytes, Instant.now()) > 0;
    }

    /**
     * Atomically decrements {@code storage_used_bytes}, clamping at 0.
     */
    @Transactional
    public void decrementStorageUsed(UUID userId, long deltaBytes) {
        if (deltaBytes < 0) {
            throw new IllegalArgumentException("deltaBytes must be non-negative");
        }
        if (deltaBytes == 0) {
            return;
        }
        userRepository.decrementStorageUsed(userId, deltaBytes, Instant.now());
    }

    /**
     * Activates the Pro subscription tier and updates the user's storage quota.
     */
    @Transactional
    public void activateProTier(UUID userId, long proStorageQuotaBytes) {
        updateSubscriptionTier(userId, "pro", proStorageQuotaBytes);
    }

    /**
     * Downgrades the user back to the Free tier and updates the storage quota.
     */
    @Transactional
    public void downgradeToFreeTier(UUID userId, long freeStorageQuotaBytes) {
        updateSubscriptionTier(userId, "free", freeStorageQuotaBytes);
    }

    private void updateSubscriptionTier(UUID userId, String tier, long storageQuotaBytes) {
        if (storageQuotaBytes < 0) {
            throw new IllegalArgumentException("storageQuotaBytes must be non-negative");
        }
        int updated = userRepository.updateSubscriptionTier(userId, tier, storageQuotaBytes, Instant.now());
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
        }
    }

    private AuthResponse buildAuthResponse(User user) {
        String accessToken = jwtService.generateAccessToken(user.getId(), user.getEmail());

        String rawRefreshToken = UUID.randomUUID().toString();
        RefreshToken refreshToken = RefreshToken.builder()
                .userId(user.getId())
                .tokenHash(hashToken(rawRefreshToken))
                .expiresAt(Instant.now().plusMillis(REFRESH_TOKEN_EXPIRATION_MS))
                .build();
        refreshTokenRepository.save(refreshToken);

        return new AuthResponse(
                accessToken,
                rawRefreshToken,
                user.getId(),
                user.getEmail(),
                user.getDisplayName()
        );
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("Unable to hash refresh token", e);
        }
    }
}
