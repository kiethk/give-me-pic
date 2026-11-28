package com.givemepic.backend.billing.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.http.HttpMethod.POST;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class PayOsClientTests {

    private static final String BASE_URL = "https://api-merchant.payos.vn";
    private static final String CLIENT_ID = "test-client-id";
    private static final String API_KEY = "test-api-key";
    private static final String CHECKSUM_KEY = "test-checksum-key";
    private static final String RETURN_URL = "http://localhost:3000/return";
    private static final String CANCEL_URL = "http://localhost:3000/cancel";

    private final ObjectMapper objectMapper = new ObjectMapper();

    private PayOsClient createClient(RestClient.Builder builder, String clientId, String apiKey, String checksumKey) {
        return new PayOsClient(builder, BASE_URL, clientId, apiKey, checksumKey, RETURN_URL, CANCEL_URL);
    }

    @Test
    void signCreateRequest_producesDeterministicHmacSha256Hex() {
        PayOsClient client = createClient(RestClient.builder(), CLIENT_ID, API_KEY, CHECKSUM_KEY);

        String signature = client.signCreateRequest(
                49_000,
                CANCEL_URL,
                "GMP PRO MONTHLY",
                123_456_789L,
                RETURN_URL
        );
        String secondCall = client.signCreateRequest(
                49_000,
                CANCEL_URL,
                "GMP PRO MONTHLY",
                123_456_789L,
                RETURN_URL
        );

        assertThat(signature).isEqualTo("5b24e221949ba84ceeb8d2e2b4bb10d906057d72937c6906dc596fc8171c94b3");
        assertThat(secondCall).isEqualTo(signature);
    }

    @Test
    void verifyWebhookSignature_validatesSortedKeysAndRejectsTamperedOrMissingOrBlankKey() throws Exception {
        PayOsClient client = createClient(RestClient.builder(), CLIENT_ID, API_KEY, CHECKSUM_KEY);

        String validDataJson = """
                {
                  "orderCode": 123456789,
                  "amount": 49000,
                  "description": "GMP PRO MONTHLY",
                  "virtualAccountName": null
                }
                """;
        JsonNode validDataNode = objectMapper.readTree(validDataJson);
        String validSignature = "737ad1060ba4f6a0dd3525e3ffcb3897b2f84f4e8c712afcc54cf39426c3ff65";

        assertThat(client.verifyWebhookSignature(validDataNode, validSignature)).isTrue();

        ObjectNode tamperedNode = (ObjectNode) validDataNode.deepCopy();
        tamperedNode.put("amount", 1_000);
        assertThat(client.verifyWebhookSignature(tamperedNode, validSignature)).isFalse();

        assertThat(client.verifyWebhookSignature(validDataNode, null)).isFalse();
        assertThat(client.verifyWebhookSignature(validDataNode, "   ")).isFalse();
        assertThat(client.verifyWebhookSignature(validDataNode, "0000000000000000")).isFalse();
        assertThat(client.verifyWebhookSignature(null, validSignature)).isFalse();

        PayOsClient blankKeyClient = createClient(RestClient.builder(), CLIENT_ID, API_KEY, "   ");
        assertThat(blankKeyClient.verifyWebhookSignature(validDataNode, validSignature)).isFalse();
    }

    @Test
    void createPaymentLinkAndGetPaymentInfo_throw503WhenKeysAreBlank() {
        PayOsClient missingClientId = createClient(RestClient.builder(), " ", API_KEY, CHECKSUM_KEY);
        PayOsClient missingApiKey = createClient(RestClient.builder(), CLIENT_ID, "", CHECKSUM_KEY);
        PayOsClient missingChecksumKey = createClient(RestClient.builder(), CLIENT_ID, API_KEY, null);

        for (PayOsClient client : new PayOsClient[]{missingClientId, missingApiKey, missingChecksumKey}) {
            assertThatThrownBy(() -> client.createPaymentLink(123_456_789L, 49_000, "GMP PRO MONTHLY", 1_800_000_000L))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                            .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));

            assertThatThrownBy(() -> client.getPaymentInfo(123_456_789L))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(ex -> assertThat(((ResponseStatusException) ex).getStatusCode())
                            .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        }
    }

    @Test
    void createPaymentLink_sendsSignedRequestAndParsesData() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PayOsClient client = createClient(builder, CLIENT_ID, API_KEY, CHECKSUM_KEY);

        String responseBody = """
                {
                  "code": "00",
                  "desc": "success",
                  "data": {
                    "orderCode": 123456789,
                    "paymentLinkId": "pl-123",
                    "checkoutUrl": "https://pay.payos.vn/web/pl-123",
                    "qrCode": "000201010212",
                    "status": "PENDING"
                  }
                }
                """;

        server.expect(requestTo(BASE_URL + "/v2/payment-requests"))
                .andExpect(method(POST))
                .andExpect(header("x-client-id", CLIENT_ID))
                .andExpect(header("x-api-key", API_KEY))
                .andExpect(jsonPath("$.orderCode").value(123_456_789L))
                .andExpect(jsonPath("$.amount").value(49_000))
                .andExpect(jsonPath("$.description").value("GMP PRO MONTHLY"))
                .andExpect(jsonPath("$.returnUrl").value(RETURN_URL))
                .andExpect(jsonPath("$.cancelUrl").value(CANCEL_URL))
                .andExpect(jsonPath("$.expiredAt").value(1_800_000_000L))
                .andExpect(jsonPath("$.signature").value("5b24e221949ba84ceeb8d2e2b4bb10d906057d72937c6906dc596fc8171c94b3"))
                .andRespond(withSuccess(responseBody, APPLICATION_JSON));

        PayOsClient.PayOsCreateResult result = client.createPaymentLink(
                123_456_789L,
                49_000,
                "GMP PRO MONTHLY",
                1_800_000_000L
        );

        assertThat(result.orderCode()).isEqualTo(123_456_789L);
        assertThat(result.paymentLinkId()).isEqualTo("pl-123");
        assertThat(result.checkoutUrl()).isEqualTo("https://pay.payos.vn/web/pl-123");
        assertThat(result.qrCode()).isEqualTo("000201010212");
        assertThat(result.status()).isEqualTo("PENDING");
        server.verify();
    }

    @Test
    void getPaymentInfo_parsesStatusAmountIdAndFirstTransactionReference() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        PayOsClient client = createClient(builder, CLIENT_ID, API_KEY, CHECKSUM_KEY);

        String responseBody = """
                {
                  "code": "00",
                  "desc": "success",
                  "data": {
                    "id": "pl-123",
                    "orderCode": 123456789,
                    "amount": 49000,
                    "amountPaid": 49000,
                    "status": "PAID",
                    "transactions": [
                      {
                        "reference": "FT24000123",
                        "amount": 49000
                      }
                    ]
                  }
                }
                """;

        server.expect(requestTo(BASE_URL + "/v2/payment-requests/123456789"))
                .andExpect(method(GET))
                .andExpect(header("x-client-id", CLIENT_ID))
                .andExpect(header("x-api-key", API_KEY))
                .andRespond(withSuccess(responseBody, APPLICATION_JSON));

        PayOsClient.PayOsStatusResult result = client.getPaymentInfo(123_456_789L);

        assertThat(result.orderCode()).isEqualTo(123_456_789L);
        assertThat(result.paymentLinkId()).isEqualTo("pl-123");
        assertThat(result.status()).isEqualTo("PAID");
        assertThat(result.amountPaid()).isEqualTo(49_000);
        assertThat(result.reference()).isEqualTo("FT24000123");
        server.verify();
    }
}
