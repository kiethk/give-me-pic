package com.givemepic.backend.chat.controller;

import com.givemepic.backend.chat.dto.SimilaritySearchResponse;
import com.givemepic.backend.chat.service.ChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    @GetMapping("/similarity-search")
    public ResponseEntity<List<SimilaritySearchResponse>> similaritySearch(
            @AuthenticationPrincipal UUID userId,
            @RequestParam String query,
            @RequestParam(required = false) UUID subjectId,
            @RequestParam(defaultValue = "5") int limit) {
        List<SimilaritySearchResponse> results = chatService.search(userId, query, subjectId, limit);
        return ResponseEntity.ok(results);
    }
}
