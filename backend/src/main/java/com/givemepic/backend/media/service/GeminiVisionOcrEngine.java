package com.givemepic.backend.media.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * OCR engine powered by Gemini Vision API (multimodal).
 * Supports Vietnamese and English text on lecture slide photos.
 *
 * <p>Before sending to the API, the image is:
 * <ol>
 *   <li>Decoded from raw bytes into a {@link BufferedImage}</li>
 *   <li>Downscaled proportionally if the longest side exceeds 1200 px</li>
 *   <li>Re-encoded as JPEG (quality ≈ 85 %) to reduce payload size</li>
 * </ol>
 */
@Service
@Primary
public class GeminiVisionOcrEngine implements OcrEngine {

    private static final Logger log = LoggerFactory.getLogger(GeminiVisionOcrEngine.class);

    private static final int MAX_RETRIES = 3;
    private static final long BASE_DELAY_MS = 1_000L;
    private static final int MAX_DIMENSION_PX = 1200;

    private static final String OCR_PROMPT =
            "Hãy trích xuất toàn bộ văn bản trong bức ảnh này. " +
            "Trình bày lại dưới định dạng Markdown, giữ nguyên cấu trúc tiêu đề, danh sách, " +
            "và bảng biểu nếu có. " +
            "Tuyệt đối không thêm bất kỳ câu chào hỏi hay bình luận nào của AI, " +
            "chỉ trả về nội dung trích xuất.";

    private final RestClient restClient;
    private final String apiKey;
    private final String model;

    @Autowired
    public GeminiVisionOcrEngine(
            RestClient.Builder restClientBuilder,
            @Value("${app.embedding.gemini-api-key:}") String apiKey,
            @Value("${app.ocr.model:gemini-2.5-flash}") String model) {
        this(restClientBuilder
                .baseUrl("https://generativelanguage.googleapis.com/v1beta")
                .build(), apiKey, model);
    }

    GeminiVisionOcrEngine(RestClient restClient, String apiKey, String model) {
        this.restClient = restClient;
        this.apiKey = apiKey;
        this.model = model;
    }

    @Override
    public String name() {
        return "gemini-vision";
    }

    @Override
    public String extractText(byte[] content, String contentType, String fileName) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("Chưa cấu hình GEMINI_API_KEY cho OCR");
        }

        byte[] processedImage = preprocessImage(content);
        String base64Image = Base64.getEncoder().encodeToString(processedImage);

        HttpClientErrorException lastException = null;
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return doOcr(base64Image);
            } catch (HttpClientErrorException e) {
                if (e.getStatusCode().value() != 429) {
                    throw new IllegalStateException("Gemini OCR API lỗi: " + e.getMessage(), e);
                }
                lastException = e;
                long delayMs = resolveDelay(e, attempt);
                log.warn("Gemini OCR 429 (attempt {}/{}), retrying in {}ms", attempt + 1, MAX_RETRIES, delayMs);
                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("OCR bị gián đoạn trong backoff", ie);
                }
            }
        }
        throw new IllegalStateException(
                "Gemini OCR vẫn trả 429 sau " + MAX_RETRIES + " lần retry", lastException);
    }

    @SuppressWarnings("unchecked")
    private String doOcr(String base64Image) {
        Map<String, Object> imagePart = Map.of(
                "inline_data", Map.of(
                        "mime_type", "image/jpeg",
                        "data", base64Image));
        Map<String, Object> textPart = Map.of("text", OCR_PROMPT);

        Map<String, Object> requestBody = Map.of(
                "contents", List.of(
                        Map.of("parts", List.of(imagePart, textPart))));

        Map<String, Object> response = restClient.post()
                .uri(uriBuilder -> uriBuilder
                        .path("/models/{model}:generateContent")
                        .queryParam("key", apiKey)
                        .build(model))
                .contentType(MediaType.APPLICATION_JSON)
                .body(requestBody)
                .retrieve()
                .body(Map.class);

        List<Map<String, Object>> candidates = (List<Map<String, Object>>) response.get("candidates");
        if (candidates == null || candidates.isEmpty()) {
            throw new IllegalStateException("Gemini OCR không trả về candidate nào: " + response);
        }
        Map<String, Object> content = (Map<String, Object>) candidates.get(0).get("content");
        List<Map<String, Object>> parts = (List<Map<String, Object>>) content.get("parts");
        return ((String) parts.get(0).get("text")).trim();
    }

    /**
     * Downscale the image if its longest side exceeds {@value #MAX_DIMENSION_PX} px,
     * then re-encode as JPEG to minimise payload size.
     */
    private byte[] preprocessImage(byte[] rawBytes) {
        try {
            BufferedImage original = ImageIO.read(new ByteArrayInputStream(rawBytes));
            if (original == null) {
                // Not a recognised image — send raw bytes, let Gemini handle it
                return rawBytes;
            }

            int w = original.getWidth();
            int h = original.getHeight();

            // Scale down only if needed
            if (Math.max(w, h) > MAX_DIMENSION_PX) {
                double scale = (double) MAX_DIMENSION_PX / Math.max(w, h);
                int newW = (int) Math.round(w * scale);
                int newH = (int) Math.round(h * scale);

                BufferedImage scaled = new BufferedImage(newW, newH, BufferedImage.TYPE_INT_RGB);
                Graphics2D g = scaled.createGraphics();
                g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                        RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                g.setRenderingHint(RenderingHints.KEY_RENDERING,
                        RenderingHints.VALUE_RENDER_QUALITY);
                g.drawImage(original, 0, 0, newW, newH, null);
                g.dispose();
                original = scaled;
            }

            // Always write as JPEG to keep payload small
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            if (!ImageIO.write(original, "jpeg", baos)) {
                // Fallback: no JPEG writer available — return raw bytes
                return rawBytes;
            }
            return baos.toByteArray();

        } catch (IOException e) {
            log.warn("Không thể tiền xử lý ảnh, gửi bytes gốc: {}", e.getMessage());
            return rawBytes;
        }
    }

    private long resolveDelay(HttpClientErrorException e, int attempt) {
        String retryAfterHeader = e.getResponseHeaders() != null
                ? e.getResponseHeaders().getFirst("Retry-After")
                : null;
        if (retryAfterHeader != null) {
            try {
                return Long.parseLong(retryAfterHeader.trim()) * 1_000L;
            } catch (NumberFormatException ignored) {
            }
        }
        return BASE_DELAY_MS * (1L << attempt);
    }
}
