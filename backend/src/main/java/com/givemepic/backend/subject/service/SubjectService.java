package com.givemepic.backend.subject.service;

import com.givemepic.backend.subject.dto.CreateSubjectRequest;
import com.givemepic.backend.subject.dto.SubjectResponse;
import com.givemepic.backend.subject.dto.UpdateSubjectRequest;
import com.givemepic.backend.subject.entity.Subject;
import com.givemepic.backend.subject.repository.SubjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SubjectService {

    private final SubjectRepository subjectRepository;

    @Transactional(readOnly = true)
    public List<SubjectResponse> list(UUID userId) {
        return subjectRepository.findByUserIdAndArchivedFalseOrderByCreatedAtDesc(userId)
                .stream()
                .map(SubjectResponse::from)
                .toList();
    }

    @Transactional
    public SubjectResponse create(UUID userId, CreateSubjectRequest request) {
        Subject subject = Subject.builder()
                .userId(userId)
                .name(request.name())
                .description(request.description())
                .colorHex(request.colorHex() == null ? "#1F4D3A" : request.colorHex())
                .semester(request.semester())
                .build();

        return SubjectResponse.from(subjectRepository.save(subject));
    }

    @Transactional(readOnly = true)
    public SubjectResponse get(UUID userId, UUID subjectId) {
        return SubjectResponse.from(findOwnedSubject(userId, subjectId));
    }

    @Transactional
    public SubjectResponse update(UUID userId, UUID subjectId, UpdateSubjectRequest request) {
        Subject subject = findOwnedSubject(userId, subjectId);
        subject.setName(request.name());
        subject.setDescription(request.description());
        subject.setColorHex(request.colorHex() == null ? subject.getColorHex() : request.colorHex());
        subject.setSemester(request.semester());
        subject.setArchived(request.archived());
        return SubjectResponse.from(subject);
    }

    @Transactional
    public void archive(UUID userId, UUID subjectId) {
        Subject subject = findOwnedSubject(userId, subjectId);
        subject.setArchived(true);
    }

    private Subject findOwnedSubject(UUID userId, UUID subjectId) {
        return subjectRepository.findByIdAndUserId(subjectId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy môn học"));
    }
}