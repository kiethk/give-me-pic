package com.givemepic.backend.subject.repository;

import com.givemepic.backend.subject.entity.Subject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SubjectRepository extends JpaRepository<Subject, UUID> {
    List<Subject> findByUserIdAndArchivedFalseOrderByCreatedAtDesc(UUID userId);
    Optional<Subject> findByIdAndUserId(UUID id, UUID userId);
}