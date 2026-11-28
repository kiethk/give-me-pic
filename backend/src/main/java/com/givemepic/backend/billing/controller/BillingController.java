package com.givemepic.backend.billing.controller;

import com.givemepic.backend.billing.dto.BillingSummaryResponse;
import com.givemepic.backend.billing.dto.CreateOrderRequest;
import com.givemepic.backend.billing.dto.OrderResponse;
import com.givemepic.backend.billing.service.BillingService;
import com.givemepic.backend.billing.service.QuotaService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * REST endpoints for subscription summary, PayOS checkout orders, and PayOS webhooks.
 */
@RestController
@RequestMapping("/api/billing")
@RequiredArgsConstructor
public class BillingController {

    private final QuotaService quotaService;
    private final BillingService billingService;

    @GetMapping("/summary")
    public ResponseEntity<BillingSummaryResponse> getSummary(@AuthenticationPrincipal UUID userId) {
        return ResponseEntity.ok(quotaService.getSummary(userId));
    }

    @PostMapping("/orders")
    public ResponseEntity<OrderResponse> createOrder(
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody CreateOrderRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(billingService.createOrder(userId, request.plan()));
    }

    @GetMapping("/orders/{orderCode}")
    public ResponseEntity<OrderResponse> getOrderStatus(
            @AuthenticationPrincipal UUID userId,
            @PathVariable long orderCode) {
        return ResponseEntity.ok(billingService.getOrderStatus(userId, orderCode));
    }

    @PostMapping("/webhook/payos")
    public ResponseEntity<Map<String, Boolean>> handlePayOsWebhook(@RequestBody String rawBody) {
        billingService.handlePayOsWebhook(rawBody);
        return ResponseEntity.ok(Map.of("success", true));
    }
}
