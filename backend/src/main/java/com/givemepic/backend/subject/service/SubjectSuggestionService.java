package com.givemepic.backend.subject.service;

import com.givemepic.backend.subject.dto.SuggestSubjectResponse;
import com.givemepic.backend.subject.entity.Subject;
import com.givemepic.backend.subject.repository.SubjectRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.*;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class SubjectSuggestionService {

    private static final Logger log = LoggerFactory.getLogger(SubjectSuggestionService.class);
    private static final int MAX_DIMENSION_PX = 1200;

    private static final Pattern ID_PATTERN = Pattern.compile("\"matchedSubjectId\"\\s*:\\s*(?:\"([^\"]+)\"|null)", Pattern.CASE_INSENSITIVE);
    private static final Pattern NAME_PATTERN = Pattern.compile("\"suggestedName\"\\s*:\\s*(?:\"([^\"]+)\"|null)", Pattern.CASE_INSENSITIVE);
    private static final Pattern IS_NEW_PATTERN = Pattern.compile("\"isNew\"\\s*:\\s*(true|false)", Pattern.CASE_INSENSITIVE);

    private final SubjectRepository subjectRepository;
    private final RestClient restClient;
    private final String apiKey;
    private final String model;

    @Autowired
    public SubjectSuggestionService(
            SubjectRepository subjectRepository,
            RestClient.Builder restClientBuilder,
            @Value("${app.embedding.gemini-api-key:}") String apiKey,
            @Value("${app.ocr.model:gemini-3.1-flash-lite}") String model) {
        this(subjectRepository,
                restClientBuilder
                        .baseUrl("https://generativelanguage.googleapis.com/v1beta")
                        .build(),
                apiKey,
                model);
    }

    SubjectSuggestionService(
            SubjectRepository subjectRepository,
            RestClient restClient,
            String apiKey,
            String model) {
        this.subjectRepository = subjectRepository;
        this.restClient = restClient;
        this.apiKey = apiKey;
        this.model = model;
    }

    public SuggestSubjectResponse suggestSubject(UUID userId, byte[] rawBytes) {
        if (rawBytes == null || rawBytes.length == 0) {
            return new SuggestSubjectResponse(null, null, false);
        }

        List<Subject> existingSubjects = subjectRepository.findByUserIdAndArchivedFalseOrderByCreatedAtDesc(userId);

        if (apiKey == null || apiKey.isBlank()) {
            log.warn("Gemini API key is not configured, skipping subject suggestion");
            return new SuggestSubjectResponse(null, null, false);
        }

        try {
            byte[] processedImage = preprocessImage(rawBytes);
            String base64Image = Base64.getEncoder().encodeToString(processedImage);

            StringBuilder subjectsJson = new StringBuilder("[");
            for (int i = 0; i < existingSubjects.size(); i++) {
                Subject s = existingSubjects.get(i);
                subjectsJson.append(String.format("{\"id\":\"%s\",\"name\":\"%s\"}",
                        s.getId(), escapeJson(s.getName())));
                if (i < existingSubjects.size() - 1) {
                    subjectsJson.append(",");
                }
            }
            subjectsJson.append("]");

            String prompt = """
                    You are an intelligent academic assistant.
                    Below is the JSON list of the user's existing courses/subjects:
                    %s

                    Analyze the provided image of a lecture slide, document, or study note:
                    1. Check if the content is semantically related to one of the user's existing subjects above (consider synonyms, course codes, or related subtopics).
                       If it matches an existing subject, return that subject's exact id in "matchedSubjectId", the subject's name in "suggestedName", and set "isNew": false.
                    2. If the document is clearly a NEW course/subject not covered by any existing subject, suggest a concise and standard course title (in Vietnamese if the document is Vietnamese, otherwise English, max 50 chars), set "matchedSubjectId": null, "suggestedName": "<Course Title>", and "isNew": true.
                    3. If the image has no readable text or is not study-related, return "matchedSubjectId": null, "suggestedName": null, "isNew": false.

                    Return ONLY a single valid JSON object, without markdown blocks or explanation:
                    {"matchedSubjectId": "uuid or null", "suggestedName": "string or null", "isNew": true/false}
                    """.formatted(subjectsJson.toString());

            Map<String, Object> imagePart = Map.of(
                    "inline_data", Map.of(
                            "mime_type", "image/jpeg",
                            "data", base64Image));
            Map<String, Object> textPart = Map.of("text", prompt);

            Map<String, Object> requestBody = Map.of(
                    "contents", List.of(
                            Map.of("parts", List.of(imagePart, textPart))));

            @SuppressWarnings("unchecked")
            Map<String, Object> response = restClient.post()
                    .uri(uriBuilder -> uriBuilder
                            .path("/models/{model}:generateContent")
                            .queryParam("key", apiKey)
                            .build(model))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .body(Map.class);

            if (response == null) {
                return new SuggestSubjectResponse(null, null, false);
            }

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> candidates = (List<Map<String, Object>>) response.get("candidates");
            if (candidates == null || candidates.isEmpty()) {
                return new SuggestSubjectResponse(null, null, false);
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> content = (Map<String, Object>) candidates.get(0).get("content");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> parts = (List<Map<String, Object>>) content.get("parts");
            String rawText = ((String) parts.get(0).get("text")).trim();

            return parseGeminiResponse(rawText, existingSubjects);

        } catch (Exception e) {
            log.error("Failed to suggest subject via Gemini: {}", e.getMessage(), e);
            return new SuggestSubjectResponse(null, null, false);
        }
    }

    SuggestSubjectResponse parseGeminiResponse(String rawText, List<Subject> existingSubjects) {
        try {
            Matcher idMatcher = ID_PATTERN.matcher(rawText);
            String matchedIdStr = (idMatcher.find() && idMatcher.group(1) != null) ? idMatcher.group(1).trim() : null;

            Matcher nameMatcher = NAME_PATTERN.matcher(rawText);
            String suggestedName = (nameMatcher.find() && nameMatcher.group(1) != null) ? nameMatcher.group(1).trim() : null;

            Matcher isNewMatcher = IS_NEW_PATTERN.matcher(rawText);
            boolean isNew = isNewMatcher.find() && Boolean.parseBoolean(isNewMatcher.group(1));

            UUID matchedSubjectId = null;
            if (matchedIdStr != null && !matchedIdStr.isBlank() && !matchedIdStr.equalsIgnoreCase("null")) {
                try {
                    UUID parsedId = UUID.fromString(matchedIdStr.trim());
                    boolean exists = existingSubjects != null && existingSubjects.stream().anyMatch(s -> s.getId().equals(parsedId));
                    if (exists) {
                        matchedSubjectId = parsedId;
                        isNew = false;
                    }
                } catch (IllegalArgumentException ignored) {
                }
            }

            if (suggestedName != null && (suggestedName.equalsIgnoreCase("null") || suggestedName.isBlank())) {
                suggestedName = null;
            }

            return new SuggestSubjectResponse(matchedSubjectId, suggestedName, isNew);

        } catch (Exception e) {
            log.warn("Could not parse Gemini response: '{}'. Error: {}", rawText, e.getMessage());
            return new SuggestSubjectResponse(null, null, false);
        }
    }

    private byte[] preprocessImage(byte[] rawBytes) {
        try {
            BufferedImage original = ImageIO.read(new ByteArrayInputStream(rawBytes));
            if (original == null) {
                return rawBytes;
            }

            int w = original.getWidth();
            int h = original.getHeight();

            if (Math.max(w, h) > MAX_DIMENSION_PX) {
                double scale = (double) MAX_DIMENSION_PX / Math.max(w, h);
                int newW = (int) Math.round(w * scale);
                int newH = (int) Math.round(h * scale);

                BufferedImage scaled = new BufferedImage(newW, newH, BufferedImage.TYPE_INT_RGB);
                Graphics2D g = scaled.createGraphics();
                g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                g.drawImage(original, 0, 0, newW, newH, null);
                g.dispose();
                original = scaled;
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            if (!ImageIO.write(original, "jpeg", baos)) {
                return rawBytes;
            }
            return baos.toByteArray();

        } catch (IOException e) {
            log.warn("Failed to preprocess image, sending raw bytes: {}", e.getMessage());
            return rawBytes;
        }
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
