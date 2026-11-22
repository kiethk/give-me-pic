package com.givemepic.backend.subject.controller;

import com.givemepic.backend.subject.dto.CreateSubjectRequest;
import com.givemepic.backend.subject.dto.SubjectResponse;
import com.givemepic.backend.subject.dto.SuggestSubjectResponse;
import com.givemepic.backend.subject.dto.UpdateSubjectRequest;
import com.givemepic.backend.subject.service.SubjectService;
import com.givemepic.backend.subject.service.SubjectSuggestionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/subjects")
@RequiredArgsConstructor
public class SubjectController {

    private final SubjectService subjectService;
    private final SubjectSuggestionService subjectSuggestionService;

    @GetMapping
    public ResponseEntity<List<SubjectResponse>> list(@AuthenticationPrincipal UUID userId) {
        return ResponseEntity.ok(subjectService.list(userId));
    }

    @PostMapping("/suggest")
    public ResponseEntity<SuggestSubjectResponse> suggest(
            @AuthenticationPrincipal UUID userId,
            @RequestParam("file") MultipartFile file) throws IOException {
        return ResponseEntity.ok(subjectSuggestionService.suggestSubject(userId, file.getBytes()));
    }

    @PostMapping
    public ResponseEntity<SubjectResponse> create(
            @AuthenticationPrincipal UUID userId,
            @Valid @RequestBody CreateSubjectRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(subjectService.create(userId, request));
    }

    @GetMapping("/{id}")
    public ResponseEntity<SubjectResponse> get(
            @AuthenticationPrincipal UUID userId,
            @PathVariable UUID id) {
        return ResponseEntity.ok(subjectService.get(userId, id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<SubjectResponse> update(
            @AuthenticationPrincipal UUID userId,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateSubjectRequest request) {
        return ResponseEntity.ok(subjectService.update(userId, id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> archive(
            @AuthenticationPrincipal UUID userId,
            @PathVariable UUID id) {
        subjectService.archive(userId, id);
        return ResponseEntity.noContent().build();
    }
}