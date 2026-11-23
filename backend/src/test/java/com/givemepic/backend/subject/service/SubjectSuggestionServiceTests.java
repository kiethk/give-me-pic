package com.givemepic.backend.subject.service;

import com.givemepic.backend.subject.dto.SuggestSubjectResponse;
import com.givemepic.backend.subject.entity.Subject;
import com.givemepic.backend.subject.repository.SubjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@ExtendWith(MockitoExtension.class)
class SubjectSuggestionServiceTests {

    @Mock
    private SubjectRepository subjectRepository;

    @Mock
    private RestClient restClient;

    private SubjectSuggestionService service;

    @BeforeEach
    void setUp() {
        service = new SubjectSuggestionService(subjectRepository, restClient, "test-api-key", "gemini-test");
    }

    @Test
    void parseGeminiResponse_matchesExistingSubject() {
        UUID existingId = UUID.randomUUID();
        Subject existing = Subject.builder()
                .id(existingId)
                .name("International Economics")
                .build();

        String rawJson = "{\"matchedSubjectId\": \"" + existingId + "\", \"suggestedName\": \"International Economics\", \"isNew\": false}";

        SuggestSubjectResponse res = service.parseGeminiResponse(rawJson, List.of(existing));

        assertThat(res.matchedSubjectId()).isEqualTo(existingId);
        assertThat(res.suggestedName()).isEqualTo("International Economics");
        assertThat(res.isNew()).isFalse();
    }

    @Test
    void parseGeminiResponse_suggestsNewSubject() {
        UUID existingId = UUID.randomUUID();
        Subject existing = Subject.builder()
                .id(existingId)
                .name("International Economics")
                .build();

        String rawJson = "{\"matchedSubjectId\": null, \"suggestedName\": \"Calculus 1\", \"isNew\": true}";

        SuggestSubjectResponse res = service.parseGeminiResponse(rawJson, List.of(existing));

        assertThat(res.matchedSubjectId()).isNull();
        assertThat(res.suggestedName()).isEqualTo("Calculus 1");
        assertThat(res.isNew()).isTrue();
    }

    @Test
    void parseGeminiResponse_handlesMarkdownCodeBlock() {
        String rawJson = "```json\n{\"matchedSubjectId\": null, \"suggestedName\": \"Computer Networks\", \"isNew\": true}\n```";

        SuggestSubjectResponse res = service.parseGeminiResponse(rawJson, List.of());

        assertThat(res.matchedSubjectId()).isNull();
        assertThat(res.suggestedName()).isEqualTo("Computer Networks");
        assertThat(res.isNew()).isTrue();
    }

    @Test
    void parseGeminiResponse_unrecognizedSubjectIdIsTreatedAsNew() {
        UUID randomOtherId = UUID.randomUUID();
        String rawJson = "{\"matchedSubjectId\": \"" + randomOtherId + "\", \"suggestedName\": \"General Physics\", \"isNew\": false}";

        SuggestSubjectResponse res = service.parseGeminiResponse(rawJson, List.of());

        // Since randomOtherId is not in existingSubjects, it must not return matchedSubjectId
        assertThat(res.matchedSubjectId()).isNull();
    }
}
