package com.givemepic.backend.billing.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.givemepic.backend.auth.entity.User;
import com.givemepic.backend.auth.repository.UserRepository;
import com.givemepic.backend.billing.entity.Subscription;
import com.givemepic.backend.billing.repository.SubscriptionRepository;
import com.givemepic.backend.billing.service.BillingPlan;
import com.givemepic.backend.billing.service.PayOsClient;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class BillingControllerIntegrationTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @MockitoBean
    private PayOsClient payOsClient;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final List<UUID> createdUserIds = new ArrayList<>();

    @AfterEach
    void tearDown() {
        if (!createdUserIds.isEmpty()) {
            userRepository.deleteAllById(createdUserIds);
            createdUserIds.clear();
        }
    }

    @Test
    void billingSummaryAndOrdersRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/billing/summary"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/billing/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"plan\":\"pro_monthly\"}"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/billing/orders/123456789"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void createOrder_createsPendingSubscriptionAndReturnsQrAndCheckoutUrl() throws Exception {
        Cookie accessCookie = registerUserAndGetAccessCookie();
        stubCreatePaymentLink();

        MockHttpServletResponse response = mockMvc.perform(post("/api/billing/orders")
                        .cookie(accessCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"plan\":\"pro_monthly\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.orderCode").isNumber())
                .andExpect(jsonPath("$.plan").value("pro_monthly"))
                .andExpect(jsonPath("$.amountVnd").value(49_000))
                .andExpect(jsonPath("$.status").value("pending"))
                .andExpect(jsonPath("$.qrCode").isNotEmpty())
                .andExpect(jsonPath("$.checkoutUrl").isNotEmpty())
                .andExpect(jsonPath("$.expiresAt").isNotEmpty())
                .andReturn()
                .getResponse();

        JsonNode body = objectMapper.readTree(response.getContentAsString());
        long orderCode = body.path("orderCode").asLong();
        assertThat(orderCode).isPositive();
        assertThat(orderCode).isLessThanOrEqualTo(9_007_199_254_740_991L);

        Subscription saved = subscriptionRepository.findByOrderCode(orderCode).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo("pending");
        assertThat(saved.getPlan()).isEqualTo("pro_monthly");
        assertThat(saved.getAmountVnd()).isEqualTo(49_000);
        assertThat(saved.getQrCode()).isEqualTo("qr-" + orderCode);
        assertThat(saved.getCheckoutUrl()).isEqualTo("https://pay.payos.vn/web/pl-" + orderCode);
    }

    @Test
    void createOrder_rejectsInvalidPlan() throws Exception {
        Cookie accessCookie = registerUserAndGetAccessCookie();

        mockMvc.perform(post("/api/billing/orders")
                        .cookie(accessCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"plan\":\"enterprise_invalid\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void webhook_rejectsInvalidSignatureAndMalformedJson() throws Exception {
        Cookie accessCookie = registerUserAndGetAccessCookie();
        long orderCode = createOrderForUser(accessCookie, "pro_monthly");

        when(payOsClient.verifyWebhookSignature(any(), eq("bad-sig"))).thenReturn(false);

        mockMvc.perform(post("/api/billing/webhook/payos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("not-valid-json"))
                .andExpect(status().isBadRequest());

        String invalidWebhook = webhookPayload("00", true, orderCode, 49_000, "REF-BAD", "bad-sig");
        mockMvc.perform(post("/api/billing/webhook/payos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidWebhook))
                .andExpect(status().isBadRequest());

        Subscription sub = subscriptionRepository.findByOrderCode(orderCode).orElseThrow();
        assertThat(sub.getStatus()).isEqualTo("pending");

        mockMvc.perform(get("/api/billing/summary").cookie(accessCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value("free"));
    }

    @Test
    void webhook_activatesProIdempotentlyAndIgnoresFailedOrUnknownOrders() throws Exception {
        Cookie accessCookie = registerUserAndGetAccessCookie();
        long orderCode = createOrderForUser(accessCookie, "pro_monthly");

        when(payOsClient.verifyWebhookSignature(any(), eq("valid-sig"))).thenReturn(true);

        // PayOS test ping with unknown orderCode + valid signature -> 200 OK
        String testPingPayload = webhookPayload("00", true, 9_999_999_999L, 1_000, "TEST-PING", "valid-sig");
        mockMvc.perform(post("/api/billing/webhook/payos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(testPingPayload))
                .andExpect(status().isOk());

        // code="00" & success=false -> 200 OK, does NOT activate Pro
        String failedPayload = webhookPayload("00", false, orderCode, 49_000, "REF-FAIL", "valid-sig");
        mockMvc.perform(post("/api/billing/webhook/payos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(failedPayload))
                .andExpect(status().isOk());

        assertThat(subscriptionRepository.findByOrderCode(orderCode).orElseThrow().getStatus()).isEqualTo("pending");
        mockMvc.perform(get("/api/billing/summary").cookie(accessCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value("free"));

        // Valid webhook with code="00" & success=true -> 200 OK, activates Pro (~ +30d)
        Instant beforeActivation = Instant.now();
        String successPayload = webhookPayload("00", true, orderCode, 49_000, "REF-OK-1", "valid-sig");
        mockMvc.perform(post("/api/billing/webhook/payos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(successPayload))
                .andExpect(status().isOk());

        Subscription activated = subscriptionRepository.findByOrderCode(orderCode).orElseThrow();
        assertThat(activated.getStatus()).isEqualTo("active");
        assertThat(activated.getPaymentReference()).isEqualTo("REF-OK-1");
        Instant expectedExpiry = beforeActivation.plus(30, ChronoUnit.DAYS);
        assertThat(activated.getExpiresAt()).isCloseTo(expectedExpiry, within(10, ChronoUnit.SECONDS));

        mockMvc.perform(get("/api/billing/summary").cookie(accessCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value("pro"))
                .andExpect(jsonPath("$.activePlan").value("pro_monthly"))
                .andExpect(jsonPath("$.photosLimit").value(BillingPlan.PRO_MONTHLY_PHOTOS))
                .andExpect(jsonPath("$.questionsLimit").value(BillingPlan.PRO_MONTHLY_QUESTIONS))
                .andExpect(jsonPath("$.storageQuotaBytes").value(BillingPlan.PRO_STORAGE_QUOTA_BYTES));

        // Duplicate webhook -> 200 OK, expiresAt stays unchanged (idempotent)
        Instant originalExpiresAt = activated.getExpiresAt();
        mockMvc.perform(post("/api/billing/webhook/payos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(successPayload))
                .andExpect(status().isOk());

        Subscription afterDuplicate = subscriptionRepository.findByOrderCode(orderCode).orElseThrow();
        assertThat(afterDuplicate.getStatus()).isEqualTo("active");
        assertThat(afterDuplicate.getExpiresAt()).isEqualTo(originalExpiresAt);
    }

    @Test
    void earlyRenewal_stacksYearlyDurationOntoExistingActiveExpiry() throws Exception {
        Cookie accessCookie = registerUserAndGetAccessCookie();
        when(payOsClient.verifyWebhookSignature(any(), eq("valid-sig"))).thenReturn(true);

        long monthlyOrderCode = createOrderForUser(accessCookie, "pro_monthly");
        mockMvc.perform(post("/api/billing/webhook/payos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(webhookPayload("00", true, monthlyOrderCode, 49_000, "REF-M", "valid-sig")))
                .andExpect(status().isOk());

        Instant monthlyExpiresAt = subscriptionRepository.findByOrderCode(monthlyOrderCode)
                .orElseThrow()
                .getExpiresAt();

        long yearlyOrderCode = createOrderForUser(accessCookie, "pro_yearly");
        mockMvc.perform(post("/api/billing/webhook/payos")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(webhookPayload("00", true, yearlyOrderCode, 490_000, "REF-Y", "valid-sig")))
                .andExpect(status().isOk());

        Subscription yearlySub = subscriptionRepository.findByOrderCode(yearlyOrderCode).orElseThrow();
        assertThat(yearlySub.getStatus()).isEqualTo("active");
        assertThat(yearlySub.getExpiresAt()).isEqualTo(monthlyExpiresAt.plus(365, ChronoUnit.DAYS));

        Subscription oldMonthlySub = subscriptionRepository.findByOrderCode(monthlyOrderCode).orElseThrow();
        assertThat(oldMonthlySub.getStatus()).isEqualTo("expired");

        mockMvc.perform(get("/api/billing/summary").cookie(accessCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value("pro"))
                .andExpect(jsonPath("$.activePlan").value("pro_yearly"));
    }

    @Test
    void getOrderStatus_rejectsOtherUserAndActivatesProWhenPayOsReturnsPaid() throws Exception {
        Cookie ownerCookie = registerUserAndGetAccessCookie();
        Cookie otherUserCookie = registerUserAndGetAccessCookie();
        long orderCode = createOrderForUser(ownerCookie, "pro_monthly");

        // Reject other user
        mockMvc.perform(get("/api/billing/orders/" + orderCode)
                        .cookie(otherUserCookie))
                .andExpect(status().isNotFound());

        // Fallback polling sees PAID -> activates Pro
        when(payOsClient.getPaymentInfo(orderCode)).thenReturn(
                new PayOsClient.PayOsStatusResult(orderCode, "pl-" + orderCode, "PAID", 49_000, "POLL-REF-1")
        );

        mockMvc.perform(get("/api/billing/orders/" + orderCode)
                        .cookie(ownerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderCode").value(orderCode))
                .andExpect(jsonPath("$.status").value("active"));

        mockMvc.perform(get("/api/billing/summary").cookie(ownerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value("pro"))
                .andExpect(jsonPath("$.activePlan").value("pro_monthly"));

        Subscription activated = subscriptionRepository.findByOrderCode(orderCode).orElseThrow();
        assertThat(activated.getStatus()).isEqualTo("active");
        assertThat(activated.getPaymentReference()).isEqualTo("POLL-REF-1");
    }

    @Test
    void getOrderStatus_doesNotDoubleExtendWhenWebhookCommitsDuringPayOsPoll() throws Exception {
        Cookie ownerCookie = registerUserAndGetAccessCookie();
        long orderCode = createOrderForUser(ownerCookie, "pro_monthly");

        when(payOsClient.verifyWebhookSignature(any(), eq("valid-sig"))).thenReturn(true);
        when(payOsClient.getPaymentInfo(orderCode)).thenAnswer(invocation -> {
            // Execute PayOS webhook on a separate thread/transaction while getPaymentInfo HTTP call is in flight
            CompletableFuture.runAsync(() -> {
                try {
                    mockMvc.perform(post("/api/billing/webhook/payos")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(webhookPayload("00", true, orderCode, 49_000, "WEBHOOK-FIRST", "valid-sig")))
                            .andExpect(status().isOk());
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }).join();

            return new PayOsClient.PayOsStatusResult(
                    orderCode,
                    "pl-" + orderCode,
                    "PAID",
                    49_000,
                    "POLL-REF-LATE"
            );
        });

        Instant beforePoll = Instant.now();
        mockMvc.perform(get("/api/billing/orders/" + orderCode)
                        .cookie(ownerCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderCode").value(orderCode))
                .andExpect(jsonPath("$.status").value("active"));

        Subscription sub = subscriptionRepository.findByOrderCode(orderCode).orElseThrow();
        assertThat(sub.getStatus()).isEqualTo("active");
        assertThat(sub.getPaymentReference()).isEqualTo("WEBHOOK-FIRST");
        assertThat(sub.getExpiresAt()).isCloseTo(beforePoll.plus(30, ChronoUnit.DAYS), within(10, ChronoUnit.SECONDS));
    }

    private long createOrderForUser(Cookie accessCookie, String plan) throws Exception {
        stubCreatePaymentLink();
        MockHttpServletResponse response = mockMvc.perform(post("/api/billing/orders")
                        .cookie(accessCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"plan\":\"" + plan + "\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse();

        return objectMapper.readTree(response.getContentAsString()).path("orderCode").asLong();
    }

    private void stubCreatePaymentLink() {
        when(payOsClient.createPaymentLink(anyLong(), anyInt(), anyString(), anyLong()))
                .thenAnswer(invocation -> {
                    long orderCode = invocation.getArgument(0);
                    return new PayOsClient.PayOsCreateResult(
                            orderCode,
                            "pl-" + orderCode,
                            "https://pay.payos.vn/web/pl-" + orderCode,
                            "qr-" + orderCode,
                            "PENDING"
                    );
                });
    }

    private String webhookPayload(
            String code,
            boolean success,
            long orderCode,
            int amount,
            String reference,
            String signature) {
        return """
                {
                  "code": "%s",
                  "desc": "success",
                  "success": %s,
                  "data": {
                    "orderCode": %d,
                    "amount": %d,
                    "description": "GMP PRO",
                    "reference": "%s"
                  },
                  "signature": "%s"
                }
                """.formatted(code, success, orderCode, amount, reference, signature);
    }

    private Cookie registerUserAndGetAccessCookie() throws Exception {
        String email = "billing-ctrl-" + UUID.randomUUID() + "@example.com";
        MockHttpServletResponse response = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email
                                + "\",\"password\":\"password123\",\"displayName\":\"Billing Test User\"}"))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse();

        User created = userRepository.findByEmail(email).orElseThrow();
        createdUserIds.add(created.getId());
        return response.getCookie("access_token");
    }
}
