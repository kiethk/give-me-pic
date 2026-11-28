package com.givemepic.backend.auth.service;

import com.givemepic.backend.auth.dto.UserQuotaSnapshot;
import com.givemepic.backend.auth.entity.User;
import com.givemepic.backend.auth.repository.UserRepository;
import com.givemepic.backend.common.exception.GlobalExceptionHandler;
import com.givemepic.backend.common.exception.QuotaExceededException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@Transactional
class AuthServiceQuotaTests {

    @Autowired
    private AuthService authService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private GlobalExceptionHandler globalExceptionHandler;

    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = userRepository.save(User.builder()
                .email("quota-" + UUID.randomUUID() + "@example.com")
                .passwordHash("hashed-password")
                .displayName("Quota Test User")
                .subscriptionTier("free")
                .storageQuotaBytes(1_000L)
                .storageUsedBytes(200L)
                .build());
    }

    @Test
    void incrementStorageUsedIfWithinQuota_SucceedsWithinQuotaAndRejectsOverQuota() {
        boolean firstAllowed = authService.incrementStorageUsedIfWithinQuota(testUser.getId(), 800L);
        assertThat(firstAllowed).isTrue();

        UserQuotaSnapshot afterFirst = authService.getQuotaSnapshot(testUser.getId());
        assertThat(afterFirst.storageUsedBytes()).isEqualTo(1_000L);
        assertThat(afterFirst.storageQuotaBytes()).isEqualTo(1_000L);
        assertThat(afterFirst.subscriptionTier()).isEqualTo("free");

        boolean secondAllowed = authService.incrementStorageUsedIfWithinQuota(testUser.getId(), 1L);
        assertThat(secondAllowed).isFalse();

        UserQuotaSnapshot afterSecond = authService.getQuotaSnapshot(testUser.getId());
        assertThat(afterSecond.storageUsedBytes()).isEqualTo(1_000L);
    }

    @Test
    void decrementStorageUsed_SubtractsAndClampsAtZero() {
        authService.decrementStorageUsed(testUser.getId(), 50L);
        assertThat(authService.getQuotaSnapshot(testUser.getId()).storageUsedBytes()).isEqualTo(150L);

        authService.decrementStorageUsed(testUser.getId(), 500L);
        assertThat(authService.getQuotaSnapshot(testUser.getId()).storageUsedBytes()).isEqualTo(0L);
    }

    @Test
    void activateProTierAndDowngradeToFreeTier_UpdatesTierAndQuotaBytes() {
        long proQuota = 10_737_418_240L;
        long freeQuota = 524_288_000L;

        authService.activateProTier(testUser.getId(), proQuota);
        UserQuotaSnapshot proSnapshot = authService.getQuotaSnapshot(testUser.getId());
        assertThat(proSnapshot.subscriptionTier()).isEqualTo("pro");
        assertThat(proSnapshot.storageQuotaBytes()).isEqualTo(proQuota);

        authService.downgradeToFreeTier(testUser.getId(), freeQuota);
        UserQuotaSnapshot freeSnapshot = authService.getQuotaSnapshot(testUser.getId());
        assertThat(freeSnapshot.subscriptionTier()).isEqualTo("free");
        assertThat(freeSnapshot.storageQuotaBytes()).isEqualTo(freeQuota);
    }

    @Test
    void globalExceptionHandler_Returns402WithQuotaExceededPayload() throws Exception {
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new QuotaThrowingController())
                .setControllerAdvice(globalExceptionHandler)
                .build();

        mockMvc.perform(get("/test/quota-exceeded"))
                .andExpect(status().isPaymentRequired())
                .andExpect(jsonPath("$.status").value(402))
                .andExpect(jsonPath("$.code").value("QUOTA_EXCEEDED"))
                .andExpect(jsonPath("$.quotaType").value("photos"))
                .andExpect(jsonPath("$.message").value("Monthly photo upload limit reached"));
    }

    @RestController
    private static class QuotaThrowingController {

        @GetMapping("/test/quota-exceeded")
        public void throwQuotaExceeded() {
            throw new QuotaExceededException("photos", "Monthly photo upload limit reached");
        }
    }
}
