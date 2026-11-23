package com.givemepic.backend.auth.service;

import com.givemepic.backend.auth.dto.AuthResponse;
import com.givemepic.backend.auth.dto.GoogleAuthRequest;
import com.givemepic.backend.auth.dto.GoogleTokenPayload;
import com.givemepic.backend.auth.dto.LoginRequest;
import com.givemepic.backend.auth.dto.RegisterRequest;
import com.givemepic.backend.auth.dto.UserProfileResponse;
import com.givemepic.backend.auth.entity.RefreshToken;
import com.givemepic.backend.auth.entity.User;
import com.givemepic.backend.auth.repository.RefreshTokenRepository;
import com.givemepic.backend.auth.repository.UserRepository;
import com.givemepic.backend.common.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTests {

    @Mock
    private UserRepository userRepository;

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtService jwtService;

    @Mock
    private GoogleTokenVerifier googleTokenVerifier;

    @InjectMocks
    private AuthService authService;

    private User testUser;
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        testUser = User.builder()
                .id(userId)
                .email("test@example.com")
                .passwordHash("hashed-password")
                .displayName("Test User")
                .build();
    }

    @Test
    void register_Success() {
        // Arrange
        RegisterRequest request = new RegisterRequest("test@example.com", "password", "Test User");
        when(userRepository.existsByEmail("test@example.com")).thenReturn(false);
        when(passwordEncoder.encode("password")).thenReturn("hashed-password");
        
        // Cần stub save user để có id nạp vào token
        doAnswer(invocation -> {
            User u = invocation.getArgument(0);
            u.setId(userId);
            return u;
        }).when(userRepository).save(any(User.class));

        when(jwtService.generateAccessToken(userId, "test@example.com")).thenReturn("mock-access-token");

        // Act
        AuthResponse response = authService.register(request);

        // Assert
        assertThat(response).isNotNull();
        assertThat(response.email()).isEqualTo("test@example.com");
        assertThat(response.accessToken()).isEqualTo("mock-access-token");
        assertThat(response.refreshToken()).isNotNull();

        verify(userRepository).save(any(User.class));
        verify(refreshTokenRepository).save(any(RefreshToken.class));
    }

    @Test
    void register_ThrowsException_WhenEmailExists() {
        // Arrange
        RegisterRequest request = new RegisterRequest("test@example.com", "password", "Test User");
        when(userRepository.existsByEmail("test@example.com")).thenReturn(true);

        // Act & Assert
        assertThatThrownBy(() -> authService.register(request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Email is already in use");

        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void login_Success() {
        // Arrange
        LoginRequest request = new LoginRequest("test@example.com", "password");
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("password", "hashed-password")).thenReturn(true);
        when(jwtService.generateAccessToken(userId, "test@example.com")).thenReturn("mock-access-token");

        // Act
        AuthResponse response = authService.login(request);

        // Assert
        assertThat(response).isNotNull();
        assertThat(response.email()).isEqualTo("test@example.com");
        assertThat(response.accessToken()).isEqualTo("mock-access-token");

        ArgumentCaptor<RefreshToken> tokenCaptor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository).save(tokenCaptor.capture());
        
        RefreshToken savedToken = tokenCaptor.getValue();
        assertThat(savedToken.getUserId()).isEqualTo(userId);
        assertThat(savedToken.getTokenHash()).isNotNull();
    }

    @Test
    void login_ThrowsException_WhenUserNotFound() {
        // Arrange
        LoginRequest request = new LoginRequest("test@example.com", "password");
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.empty());

        // Act & Assert
        assertThatThrownBy(() -> authService.login(request))
                .isInstanceOf(BadCredentialsException.class)
                .hasMessage("Invalid email or password");
    }

    @Test
    void login_ThrowsException_WhenPasswordWrong() {
        // Arrange
        LoginRequest request = new LoginRequest("test@example.com", "wrong-password");
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("wrong-password", "hashed-password")).thenReturn(false);

        // Act & Assert
        assertThatThrownBy(() -> authService.login(request))
                .isInstanceOf(BadCredentialsException.class)
                .hasMessage("Invalid email or password");
    }

    @Test
    void getProfile_Success() {
        // Arrange
        when(userRepository.findById(userId)).thenReturn(Optional.of(testUser));

        // Act
        UserProfileResponse response = authService.getProfile(userId);

        // Assert
        assertThat(response).isNotNull();
        assertThat(response.email()).isEqualTo("test@example.com");
        assertThat(response.displayName()).isEqualTo("Test User");
    }

    @Test
    void getProfile_ThrowsException_WhenUserNotFound() {
        // Arrange
        when(userRepository.findById(userId)).thenReturn(Optional.empty());

        // Act & Assert
        assertThatThrownBy(() -> authService.getProfile(userId))
                .isInstanceOf(ResponseStatusException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.NOT_FOUND);
    }

    @Test
    void authenticateWithGoogle_NewUser_CreatesUser() {
        // Arrange
        GoogleAuthRequest request = new GoogleAuthRequest("valid-id-token");
        GoogleTokenPayload payload = new GoogleTokenPayload(
                "google-sub-123",
                "googleuser@example.com",
                "true",
                "Google User",
                "https://avatar.url/pic.jpg",
                "client-id-123",
                "https://accounts.google.com"
        );
        when(googleTokenVerifier.verify("valid-id-token")).thenReturn(payload);
        when(userRepository.findByEmailIgnoreCase("googleuser@example.com")).thenReturn(Optional.empty());

        UUID newUserId = UUID.randomUUID();
        doAnswer(invocation -> {
            User u = invocation.getArgument(0);
            u.setId(newUserId);
            return u;
        }).when(userRepository).save(any(User.class));

        when(jwtService.generateAccessToken(newUserId, "googleuser@example.com")).thenReturn("access-token-xyz");

        // Act
        AuthResponse response = authService.authenticateWithGoogle(request);

        // Assert
        assertThat(response).isNotNull();
        assertThat(response.email()).isEqualTo("googleuser@example.com");
        assertThat(response.displayName()).isEqualTo("Google User");

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());
        User savedUser = userCaptor.getValue();
        assertThat(savedUser.getProvider()).isEqualTo("google");
        assertThat(savedUser.getProviderId()).isEqualTo("google-sub-123");
        assertThat(savedUser.getPasswordHash()).isNull();
        assertThat(savedUser.getAvatarUrl()).isEqualTo("https://avatar.url/pic.jpg");
    }

    @Test
    void authenticateWithGoogle_NewUser_TruncatesLongDisplayNameAndIgnoresOversizedAvatar() {
        // Arrange
        String veryLongName = "A".repeat(150);
        String veryLongAvatar = "https://example.com/" + "x".repeat(600);
        GoogleAuthRequest request = new GoogleAuthRequest("valid-id-token");
        GoogleTokenPayload payload = new GoogleTokenPayload(
                "google-sub-789",
                "LONGNAME@EXAMPLE.COM",
                "true",
                veryLongName,
                veryLongAvatar,
                "client-id-123",
                "https://accounts.google.com"
        );
        when(googleTokenVerifier.verify("valid-id-token")).thenReturn(payload);
        when(userRepository.findByEmailIgnoreCase("longname@example.com")).thenReturn(Optional.empty());

        UUID newUserId = UUID.randomUUID();
        doAnswer(invocation -> {
            User u = invocation.getArgument(0);
            u.setId(newUserId);
            return u;
        }).when(userRepository).save(any(User.class));

        when(jwtService.generateAccessToken(newUserId, "longname@example.com")).thenReturn("access-token-long");

        // Act
        AuthResponse response = authService.authenticateWithGoogle(request);

        // Assert
        assertThat(response).isNotNull();
        assertThat(response.email()).isEqualTo("longname@example.com");

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());
        User savedUser = userCaptor.getValue();
        assertThat(savedUser.getDisplayName()).hasSize(100);
        assertThat(savedUser.getAvatarUrl()).isNull(); // Exceeds 500 characters
    }

    @Test
    void authenticateWithGoogle_ExistingUser_LinksAndSyncsAvatar() {
        // Arrange
        User existingUser = User.builder()
                .id(userId)
                .email("existing@example.com")
                .displayName("Existing Local")
                .passwordHash("local-hash")
                .avatarUrl(null)
                .provider("local")
                .build();

        GoogleAuthRequest request = new GoogleAuthRequest("valid-id-token");
        GoogleTokenPayload payload = new GoogleTokenPayload(
                "google-sub-456",
                "EXISTING@EXAMPLE.COM",
                "true",
                "Google Display",
                "https://new-avatar.url/pic.jpg",
                "client-id-123",
                "https://accounts.google.com"
        );
        when(googleTokenVerifier.verify("valid-id-token")).thenReturn(payload);
        when(userRepository.findByEmailIgnoreCase("existing@example.com")).thenReturn(Optional.of(existingUser));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        when(jwtService.generateAccessToken(userId, "existing@example.com")).thenReturn("access-token-existing");

        // Act
        AuthResponse response = authService.authenticateWithGoogle(request);

        // Assert
        assertThat(response).isNotNull();
        assertThat(response.email()).isEqualTo("existing@example.com");

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());
        User savedUser = userCaptor.getValue();
        assertThat(savedUser.getProvider()).isEqualTo("google");
        assertThat(savedUser.getProviderId()).isEqualTo("google-sub-456");
        assertThat(savedUser.getAvatarUrl()).isEqualTo("https://new-avatar.url/pic.jpg");
        assertThat(savedUser.getPasswordHash()).isEqualTo("local-hash"); // Preserved
    }

    @Test
    void login_ThrowsException_WhenPasswordHashIsNull() {
        // Arrange: User signed up via Google with null passwordHash
        User googleOnlyUser = User.builder()
                .id(userId)
                .email("google-only@example.com")
                .displayName("Google User")
                .passwordHash(null)
                .provider("google")
                .providerId("sub-123")
                .build();
        when(userRepository.findByEmail("google-only@example.com")).thenReturn(Optional.of(googleOnlyUser));

        LoginRequest request = new LoginRequest("google-only@example.com", "any-password");

        // Act & Assert
        assertThatThrownBy(() -> authService.login(request))
                .isInstanceOf(BadCredentialsException.class)
                .hasMessage("Invalid email or password");
    }
}
