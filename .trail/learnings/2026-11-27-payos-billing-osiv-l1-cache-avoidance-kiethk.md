---
title: PayOS billing OSIV L1-cache avoidance and MediaService quota boundary
author: Kiethk
date: 2026-11-27
branch: main
id: l-4eae3efd
scope: repo
status: active
src: agent
touches:
  - backend/src/main/java/com/givemepic/backend/BackendApplication.java
  - backend/src/main/java/com/givemepic/backend/auth/repository/UserRepository.java
  - backend/src/main/java/com/givemepic/backend/auth/service/AuthService.java
  - backend/src/main/java/com/givemepic/backend/chat/service/ChatService.java
  - backend/src/main/java/com/givemepic/backend/common/config/SecurityConfig.java
  - backend/src/main/java/com/givemepic/backend/common/exception/GlobalExceptionHandler.java
  - backend/src/main/java/com/givemepic/backend/media/controller/MediaController.java
  - backend/src/main/java/com/givemepic/backend/media/service/MediaService.java
  - backend/src/main/resources/application.yml
  - backend/src/test/java/com/givemepic/backend/chat/controller/ChatStreamingControllerTests.java
---

## Decided
- Keep PayOsClient HTTP calls outside DB transactions and use non-entity DTO projection (SubscriptionRepository.findOrderSnapshotByOrderCodeAndUserId) before TransactionTemplate + PESSIMISTIC_WRITE (findByOrderCodeForUpdate) in BillingService.getOrderStatus.
- Put quotaService.consumeUploadQuota before try { objectStorageService.store(...) } catch (RuntimeException) in MediaService.upload and MediaService.confirmUpload.
- Enforce clearAutomatically = true, flushAutomatically = true on all @Modifying queries in UserRepository and UsageMonthlyRepository.

## Tried and ruled out
- Calling findByOrderCodeAndUserId (entity) or outer @Transactional around PayOsClient HTTP calls in BillingService: Spring Boot default open-in-view (OSIV) shares one EntityManager across the HTTP thread, causing Hibernate L1 cache to ignore refreshed PostgreSQL status under FOR UPDATE.
- Using payos-java third-party SDK: avoided transitive Jackson/HTTP conflicts on Spring Boot 4.1 / Java 21.
