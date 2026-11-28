package com.givemepic.backend.billing.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request payload to create a PayOS checkout order for a Pro billing plan.
 */
public record CreateOrderRequest(
        @NotBlank(message = "Plan is required")
        String plan
) {
}
