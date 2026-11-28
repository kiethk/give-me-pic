package com.givemepic.backend.billing.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

@Service
public class PayOsClient {

    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final String HEADER_CLIENT_ID = "x-client-id";
    private static final String HEADER_API_KEY = "x-api-key";
    private static final String PAYOS_SUCCESS_CODE = "00";

    private final RestClient restClient;
    private final String clientId;
    private final String apiKey;
    private final String checksumKey;
    private final String returnUrl;
    private final String cancelUrl;
    private final ObjectMapper objectMapper;

    public record PayOsCreateResult(
            long orderCode,
            String paymentLinkId,
            String checkoutUrl,
            String qrCode,
            String status
    ) {
    }

    public record PayOsStatusResult(
            long orderCode,
            String paymentLinkId,
            String status,
            int amountPaid,
            String reference
    ) {
    }

    @Autowired
    public PayOsClient(
            RestClient.Builder restClientBuilder,
            @Value("${app.payos.base-url:https://api-merchant.payos.vn}") String baseUrl,
            @Value("${app.payos.client-id:}") String clientId,
            @Value("${app.payos.api-key:}") String apiKey,
            @Value("${app.payos.checksum-key:}") String checksumKey,
            @Value("${app.payos.return-url:http://localhost:3000/dashboard/profile?payment=success}") String returnUrl,
            @Value("${app.payos.cancel-url:http://localhost:3000/dashboard/profile?payment=cancelled}") String cancelUrl) {
        this(
                restClientBuilder.baseUrl(baseUrl).build(),
                clientId,
                apiKey,
                checksumKey,
                returnUrl,
                cancelUrl,
                new ObjectMapper()
        );
    }

    PayOsClient(
            RestClient restClient,
            String clientId,
            String apiKey,
            String checksumKey,
            String returnUrl,
            String cancelUrl,
            ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.clientId = clientId;
        this.apiKey = apiKey;
        this.checksumKey = checksumKey;
        this.returnUrl = returnUrl;
        this.cancelUrl = cancelUrl;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
    }

    /**
     * Creates a PayOS v2 payment request link and returns the checkout metadata.
     */
    public PayOsCreateResult createPaymentLink(
            long orderCode,
            int amountVnd,
            String description,
            long expiredAtEpochSeconds) {
        ensureConfigured();

        String signature = signCreateRequest(amountVnd, cancelUrl, description, orderCode, returnUrl);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("orderCode", orderCode);
        body.put("amount", amountVnd);
        body.put("description", description);
        body.put("returnUrl", returnUrl);
        body.put("cancelUrl", cancelUrl);
        body.put("expiredAt", expiredAtEpochSeconds);
        body.put("signature", signature);

        try {
            String rawResponse = restClient.post()
                    .uri("/v2/payment-requests")
                    .header(HEADER_CLIENT_ID, clientId)
                    .header(HEADER_API_KEY, apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);

            JsonNode data = parseSuccessData(rawResponse, "create payment link");
            return new PayOsCreateResult(
                    data.path("orderCode").asLong(orderCode),
                    textOrNull(data.get("paymentLinkId")),
                    textOrNull(data.get("checkoutUrl")),
                    textOrNull(data.get("qrCode")),
                    data.path("status").asText("")
            );
        } catch (ResponseStatusException e) {
            throw e;
        } catch (RestClientException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to create PayOS payment link", e);
        }
    }

    /**
     * Fetches the current payment status for an order from PayOS v2.
     */
    public PayOsStatusResult getPaymentInfo(long orderCode) {
        ensureConfigured();

        try {
            String rawResponse = restClient.get()
                    .uri("/v2/payment-requests/{orderCode}", orderCode)
                    .header(HEADER_CLIENT_ID, clientId)
                    .header(HEADER_API_KEY, apiKey)
                    .retrieve()
                    .body(String.class);

            JsonNode data = parseSuccessData(rawResponse, "fetch payment status");
            String reference = null;
            JsonNode transactions = data.path("transactions");
            if (transactions.isArray() && !transactions.isEmpty()) {
                reference = textOrNull(transactions.get(0).get("reference"));
            }

            return new PayOsStatusResult(
                    data.path("orderCode").asLong(orderCode),
                    textOrNull(data.get("id")),
                    data.path("status").asText(""),
                    data.path("amountPaid").asInt(0),
                    reference
            );
        } catch (ResponseStatusException e) {
            throw e;
        } catch (RestClientException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Failed to query PayOS payment status", e);
        }
    }

    /**
     * Verifies a PayOS webhook payload's HMAC-SHA256 signature using lexicographically sorted data fields.
     */
    public boolean verifyWebhookSignature(JsonNode dataNode, String providedSignature) {
        if (isBlank(checksumKey) || dataNode == null || !dataNode.isObject() || isBlank(providedSignature)) {
            return false;
        }

        Map<String, String> sortedFields = new TreeMap<>();
        for (Map.Entry<String, JsonNode> entry : dataNode.properties()) {
            sortedFields.put(entry.getKey(), formatWebhookValue(entry.getValue()));
        }

        String canonicalData = sortedFields.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("&"));

        String expectedSignature = hmacSha256Hex(canonicalData, checksumKey);
        return MessageDigest.isEqual(
                expectedSignature.getBytes(StandardCharsets.UTF_8),
                providedSignature.trim().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8)
        );
    }

    /**
     * Signs a PayOS create-payment-request payload with HMAC-SHA256 lowercase hex.
     */
    public String signCreateRequest(
            int amount,
            String cancelUrl,
            String description,
            long orderCode,
            String returnUrl) {
        if (isBlank(checksumKey)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Payment gateway is not configured");
        }
        String canonical = "amount=" + amount
                + "&cancelUrl=" + nullToEmpty(cancelUrl)
                + "&description=" + nullToEmpty(description)
                + "&orderCode=" + orderCode
                + "&returnUrl=" + nullToEmpty(returnUrl);
        return hmacSha256Hex(canonical, checksumKey);
    }

    private void ensureConfigured() {
        if (isBlank(clientId) || isBlank(apiKey) || isBlank(checksumKey)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Payment gateway is not configured");
        }
    }

    private JsonNode parseSuccessData(String rawResponse, String operation) {
        if (isBlank(rawResponse)) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Empty response from PayOS during " + operation);
        }
        try {
            JsonNode root = objectMapper.readTree(rawResponse);
            String code = root.path("code").asText("");
            JsonNode data = root.path("data");
            if (!PAYOS_SUCCESS_CODE.equals(code) || !data.isObject()) {
                String desc = root.path("desc").asText("unexpected PayOS response");
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "PayOS failed to " + operation + ": " + desc
                );
            }
            return data;
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Invalid JSON from PayOS during " + operation, e);
        }
    }

    private String hmacSha256Hex(String payload, String secret) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            byte[] digest = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("Failed to compute PayOS HMAC-SHA256 signature", e);
        }
    }

    private static String formatWebhookValue(JsonNode value) {
        if (value == null || value.isNull()) {
            return "";
        }
        if (value.isValueNode()) {
            return value.asText();
        }
        return value.toString();
    }

    private static String textOrNull(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        String text = node.asText();
        return text == null || text.isBlank() ? null : text;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
