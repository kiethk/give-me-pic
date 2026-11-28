# PayOS Billing & Monthly Quota Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build production-ready VND monetization via PayOS (VietQR + HMAC-SHA256 webhook + fallback polling sync), enforce monthly upload/chat/storage quotas for Free vs Pro users, and wire an in-app `UpgradeProModal` plus usage dashboard in Next.js.

**Architecture:** Introduce an isolated Spring Boot module `com.givemepic.backend.billing` (`PayOsClient` via Spring `RestClient`, `QuotaService`, `BillingService`, `BillingController`) backed by Flyway `V12` (`subscriptions`, `usage_monthly` + backfill). All mutations on `users` stay inside `AuthService` (strict module boundary), while `MediaService` and `ChatService` call `QuotaService` before touching S3 or Gemini LLM. On the frontend, `UpgradeProModal` renders PayOS VietQR via `qrcode.react`, polls order status every 3s, and opens automatically from topbar, mobile sheet, profile, or HTTP `402` quota prompts.

**Tech Stack:** Java 21, Spring Boot 4.1.0, Spring `RestClient`, `com.fasterxml.jackson.databind.ObjectMapper`, PostgreSQL + Flyway, Next.js 16 (App Router, TypeScript), `qrcode.react`.

**Spec:** [docs/superpowers/specs/2026-11-27-payos-billing-quota-design.md](file:///d:/Workspace/give-me-pic/docs/superpowers/specs/2026-11-27-payos-billing-quota-design.md)

## Global Constraints
- Java 21 (`backend/pom.xml`); top-level Java imports only (no inline package-qualified class names).
- All `@Modifying` JPA queries in `UserRepository` and `UsageMonthlyRepository` MUST specify `clearAutomatically = true, flushAutomatically = true` to prevent stale Hibernate L1 cache during tests.
- Do NOT run `git commit` after individual tasks (user rule in `AGENTS.md` requires committing only after final approval at the end).
- All UI copy, error messages, exceptions, and logs in English.
- Module boundary (`spring-boot-module-structure.md`): `billing` accesses `users` strictly via `AuthService`; `MediaService` and `ChatService` access quota/storage operations strictly via `QuotaService`.
- Pricing & quotas: `free` = 20 photos/mo, 30 questions/mo, `524_288_000L` bytes (500 MB); `pro_monthly` = 49,000 VND / 30 days; `pro_yearly` = 490,000 VND / 365 days; `pro` = 500 photos/mo, 500 questions/mo, `10_737_418_240L` bytes (10 GB).
- Never compute/verify PayOS HMAC-SHA256 with blank keys; fail closed (`503` on outbound calls, `false` / `400` on webhook verification).

## Review Focus
1. **Blank PayOS keys in local/CI environments** — `PayOsClient` must return `503` on order creation/polling and reject webhook verification (`false` -> `400`) rather than signing with `""`.
2. **Concurrent webhook + status polling double-activation** — `BillingService.activateOrderIfPending` must update `pending -> active` atomically/under lock so `expires_at` is never extended twice for the same `orderCode`.
3. **Upload quota failure inside `MediaService` `try/catch`** — `consumeUploadQuota` must run strictly before `try { objectStorageService.store(...); ... } catch (RuntimeException)` so `402` is never converted into `500` and no orphan S3 file is written.
4. **Chat `402` optimistic UI cleanup (`handleSend` vs `handleRetry`)** — `handleSend` removes both `tempUserMessage` and `tempAssistantMessage` and restores `question` input; `handleRetry` removes only `tempAssistantMessage`.
5. **Expired Pro downgrade without destructive deletion** — lazy/scheduled downgrade resets `subscription_tier = 'free'` and `storage_quota_bytes = 524_288_000L` without deleting existing user files; new uploads above 500 MB are blocked cleanly.

---

### Task 1: Flyway `V12` Migration, Backfill, `QuotaExceededException`, and `AuthService` Quota Operations

**Files:**
- Create: `backend/src/main/resources/db/migration/V12__create_billing_tables.sql`
- Create: `backend/src/main/java/com/givemepic/backend/common/exception/QuotaExceededException.java`
- Modify: `backend/src/main/java/com/givemepic/backend/common/exception/GlobalExceptionHandler.java`
- Modify: `backend/src/main/java/com/givemepic/backend/auth/repository/UserRepository.java`
- Modify: `backend/src/main/java/com/givemepic/backend/auth/service/AuthService.java`
- Test: `backend/src/test/java/com/givemepic/backend/auth/service/AuthServiceQuotaTests.java`

**Interfaces:**
- Produces on `QuotaExceededException`: `QuotaExceededException(String quotaType, String message)` (`quotaType` in `"photos" | "questions" | "storage"`).
- Produces on `AuthService`:
  - `public UserQuotaSnapshot getQuotaSnapshot(UUID userId)` (record: `UUID userId, String subscriptionTier, long storageQuotaBytes, long storageUsedBytes`)
  - `public boolean incrementStorageUsedIfWithinQuota(UUID userId, long deltaBytes)`
  - `public void decrementStorageUsed(UUID userId, long deltaBytes)`
  - `public void activateProTier(UUID userId, long proStorageQuotaBytes)`
  - `public void downgradeToFreeTier(UUID userId, long freeStorageQuotaBytes)`

- [ ] **Step 1: Write `V12__create_billing_tables.sql`**
  Create `subscriptions` and `usage_monthly` tables matching spec §4, create indexes (`idx_subscriptions_user_status`, partial `idx_subscriptions_expires_at`), backfill `users.storage_used_bytes` from `SUM(media_files.size_bytes)`, and backfill `usage_monthly` for current UTC month (`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')`) filtering `media_files.created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')` and `chat_messages.created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')` (`role = 'user'`).

- [ ] **Step 2: Write failing test `AuthServiceQuotaTests.java` + `QuotaExceededException` test**
  Verify:
  1. `incrementStorageUsedIfWithinQuota` returns `true` when `used + delta <= quota` and `false` when it exceeds `quota`.
  2. `decrementStorageUsed` clamps at `0` when `delta > used`.
  3. `GlobalExceptionHandler` maps `QuotaExceededException("photos", "...")` to HTTP `402` with JSON `code = "QUOTA_EXCEEDED"` and `quotaType = "photos"`.

- [ ] **Step 3: Run test to verify it fails**
  Run: `cmd /c "cd backend && mvnw.cmd test -Dtest=AuthServiceQuotaTests"`
  Expected: FAIL (missing methods/classes).

- [ ] **Step 4: Implement `QuotaExceededException`, `GlobalExceptionHandler` handler, `UserRepository` atomic `@Modifying` queries, and `AuthService` methods**
  - `UserRepository`: `@Modifying @Query("UPDATE User u SET u.storageUsedBytes = u.storageUsedBytes + :delta WHERE u.id = :userId AND u.storageUsedBytes + :delta <= u.storageQuotaBytes") int incrementStorageUsedIfWithinQuota(UUID userId, long delta)` and `@Modifying @Query("UPDATE User u SET u.storageUsedBytes = CASE WHEN u.storageUsedBytes > :delta THEN u.storageUsedBytes - :delta ELSE 0 END WHERE u.id = :userId") void decrementStorageUsed(UUID userId, long delta)`.
  - `AuthService`: expose `UserQuotaSnapshot`, `getQuotaSnapshot`, `incrementStorageUsedIfWithinQuota`, `decrementStorageUsed`, `activateProTier`, `downgradeToFreeTier`.
  - `GlobalExceptionHandler`: `@ExceptionHandler(QuotaExceededException.class)` returns `HttpStatus.PAYMENT_REQUIRED` with `timestamp`, `status = 402`, `code = "QUOTA_EXCEEDED"`, `quotaType`, `message`.

- [ ] **Step 5: Run test & compile check**
  Run: `cmd /c "cd backend && mvnw.cmd test -Dtest=AuthServiceQuotaTests"`
  Expected: PASS (Flyway `V12` runs cleanly, all assertions pass).

- [ ] **Step 6: Commit**
  ```bash
  git add backend/src/main/resources/db/migration/V12__create_billing_tables.sql backend/src/main/java/com/givemepic/backend/common/exception/ backend/src/main/java/com/givemepic/backend/auth/ backend/src/test/java/com/givemepic/backend/auth/service/AuthServiceQuotaTests.java
  git commit -m "feat(billing): add V12 billing migration, 402 exception, and AuthService quota methods"
  ```

---

### Task 2: Billing Entities, Config, `SecurityConfig`, and `PayOsClient` (`RestClient` + HMAC-SHA256)

**Files:**
- Create: `backend/src/main/java/com/givemepic/backend/billing/entity/Subscription.java`
- Create: `backend/src/main/java/com/givemepic/backend/billing/entity/UsageMonthly.java`
- Create: `backend/src/main/java/com/givemepic/backend/billing/repository/SubscriptionRepository.java`
- Create: `backend/src/main/java/com/givemepic/backend/billing/repository/UsageMonthlyRepository.java`
- Create: `backend/src/main/java/com/givemepic/backend/billing/service/BillingPlan.java`
- Create: `backend/src/main/java/com/givemepic/backend/billing/service/PayOsClient.java`
- Modify: `backend/src/main/java/com/givemepic/backend/BackendApplication.java` (add `@EnableScheduling`)
- Modify: `backend/src/main/java/com/givemepic/backend/common/config/SecurityConfig.java` (permit `/api/billing/webhook/payos`)
- Modify: `backend/src/main/resources/application.yml` (add `app.payos.*` placeholders)
- Test: `backend/src/test/java/com/givemepic/backend/billing/service/PayOsClientTests.java`

**Interfaces:**
- Produces `BillingPlan` enum: `FREE`, `PRO_MONTHLY("pro_monthly", 49_000, 30, "GMP PRO MONTHLY")`, `PRO_YEARLY("pro_yearly", 490_000, 365, "GMP PRO YEARLY")`, plus tier constants (`FREE_PHOTOS = 20`, `FREE_QUESTIONS = 30`, `FREE_STORAGE = 524_288_000L`, `PRO_PHOTOS = 500`, `PRO_QUESTIONS = 500`, `PRO_STORAGE = 10_737_418_240L`).
- Produces `PayOsClient`:
  - `public PayOsCreateResult createPaymentLink(long orderCode, int amountVnd, String description, long expiredAtEpochSeconds)`
  - `public PayOsStatusResult getPaymentInfo(long orderCode)`
  - `public boolean verifyWebhookSignature(JsonNode dataNode, String providedSignature)`
  - `public String signCreateRequest(int amount, String cancelUrl, String description, long orderCode, String returnUrl)`

- [ ] **Step 1: Write failing test `PayOsClientTests.java`**
  Cover:
  1. `signCreateRequest` produces exact deterministic HMAC-SHA256 lowercase hex for `amount=49000&cancelUrl=...&description=...&orderCode=...&returnUrl=...`.
  2. `verifyWebhookSignature` returns `true` for valid alphabetically-sorted `data` JSON object signature and `false` for tampered `amount` or missing/wrong signature.
  3. Blank `checksumKey` -> `verifyWebhookSignature` ALWAYS returns `false` (never signs with empty key).
  4. Blank `clientId` / `apiKey` / `checksumKey` -> `createPaymentLink` and `getPaymentInfo` throw `ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE)`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cmd /c "cd backend && mvnw.cmd test -Dtest=PayOsClientTests"`
  Expected: FAIL.

- [ ] **Step 3: Implement Entities, Repositories, `BillingPlan`, `PayOsClient`, and config updates**
  - Add `@EnableScheduling` to `BackendApplication.java`.
  - Permit `/api/billing/webhook/payos` in `SecurityConfig.java`.
  - Add `app.payos.*` to `application.yml`.
  - Use `javax.crypto.Mac` (`HmacSHA256`) + `MessageDigest.isEqual` in `PayOsClient`, `RestClient` for PayOS v2 API (`POST /v2/payment-requests`, `GET /v2/payment-requests/{orderCode}`), and `com.fasterxml.jackson.databind.ObjectMapper` for parsing response JSON.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cmd /c "cd backend && mvnw.cmd test -Dtest=PayOsClientTests"`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/src/main/java/com/givemepic/backend/BackendApplication.java backend/src/main/java/com/givemepic/backend/common/config/SecurityConfig.java backend/src/main/resources/application.yml backend/src/main/java/com/givemepic/backend/billing/ backend/src/test/java/com/givemepic/backend/billing/service/PayOsClientTests.java
  git commit -m "feat(billing): add PayOsClient, billing entities, and scheduling config"
  ```

---

### Task 3: `QuotaService` (Atomic Monthly Counters, Storage Caps, Lazy & Scheduled Expiry)

**Files:**
- Create: `backend/src/main/java/com/givemepic/backend/billing/dto/BillingSummaryResponse.java`
- Create: `backend/src/main/java/com/givemepic/backend/billing/service/QuotaService.java`
- Modify: `backend/src/main/java/com/givemepic/backend/billing/repository/UsageMonthlyRepository.java` (add atomic native `INSERT ... ON CONFLICT DO UPDATE WHERE ...` queries)
- Modify: `backend/src/main/java/com/givemepic/backend/billing/repository/SubscriptionRepository.java`
- Test: `backend/src/test/java/com/givemepic/backend/billing/service/QuotaServiceIntegrationTests.java`

**Interfaces:**
- Consumes: `AuthService` quota methods, `SubscriptionRepository`, `UsageMonthlyRepository`.
- Produces on `QuotaService`:
  - `public BillingSummaryResponse getSummary(UUID userId)`
  - `public void assertUploadAllowed(UUID userId, long fileSizeBytes)`
  - `public void consumeUploadQuota(UUID userId, long fileSizeBytes)`
  - `public void releaseStorage(UUID userId, long fileSizeBytes)`
  - `public void consumeQuestionQuota(UUID userId)`
  - `public boolean lazyDowngradeIfExpired(UUID userId)`
  - `public void expireSubscriptionsJob()` (`@Scheduled(cron = "0 0 * * * *")`)

- [ ] **Step 1: Write failing integration test `QuotaServiceIntegrationTests.java`**
  Test:
  1. Free user hits 20 photos -> 21st `consumeUploadQuota` throws `QuotaExceededException("photos", ...)`; `assertUploadAllowed` throws at 20.
  2. Free user hits 30 questions -> 31st `consumeQuestionQuota` throws `QuotaExceededException("questions", ...)`.
  3. Storage cap: Free user `storageQuotaBytes = 524_288_000L`; uploading a file that pushes `used + size > quota` throws `QuotaExceededException("storage", ...)` and leaves `photos_uploaded_count` rolled back; `releaseStorage` decrements `storage_used_bytes` without refunding `photos_uploaded_count`.
  4. Expired Pro user (`subscriptionTier = "pro"` with `expires_at < now()`): `getSummary` or `consumeQuestionQuota` triggers lazy downgrade to `"free"` / `500 MB`, keeping existing `storageUsedBytes` intact.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cmd /c "cd backend && mvnw.cmd test -Dtest=QuotaServiceIntegrationTests"`
  Expected: FAIL.

- [ ] **Step 3: Implement `BillingSummaryResponse`, atomic `UsageMonthlyRepository` queries, and `QuotaService`**
  Ensure `consumeUploadQuota` first runs atomic `UsageMonthlyRepository.tryIncrementPhotos(id, userId, yearMonth, limit)` (`0` rows $\to$ throw `QuotaExceededException("photos", ...)`) and then `authService.incrementStorageUsedIfWithinQuota(userId, fileSizeBytes)` (`false` $\to$ throw `QuotaExceededException("storage", ...)`, `@Transactional` rolls back photo count).

- [ ] **Step 4: Run test to verify it passes**
  Run: `cmd /c "cd backend && mvnw.cmd test -Dtest=QuotaServiceIntegrationTests"`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/src/main/java/com/givemepic/backend/billing/dto/BillingSummaryResponse.java backend/src/main/java/com/givemepic/backend/billing/service/QuotaService.java backend/src/main/java/com/givemepic/backend/billing/repository/ backend/src/test/java/com/givemepic/backend/billing/service/QuotaServiceIntegrationTests.java
  git commit -m "feat(billing): implement QuotaService with atomic monthly limits and expiry downgrade"
  ```

---

### Task 4: `BillingService` & `BillingController` (PayOS Orders, Raw-String Webhook, Fallback Polling)

**Files:**
- Create: `backend/src/main/java/com/givemepic/backend/billing/dto/CreateOrderRequest.java`
- Create: `backend/src/main/java/com/givemepic/backend/billing/dto/OrderResponse.java`
- Create: `backend/src/main/java/com/givemepic/backend/billing/service/BillingService.java`
- Create: `backend/src/main/java/com/givemepic/backend/billing/controller/BillingController.java`
- Test: `backend/src/test/java/com/givemepic/backend/billing/controller/BillingControllerIntegrationTests.java`

**Interfaces:**
- Consumes: `PayOsClient`, `QuotaService`, `AuthService`, `SubscriptionRepository`.
- Produces HTTP endpoints:
  - `GET /api/billing/summary` $\to$ `BillingSummaryResponse`
  - `POST /api/billing/orders` (`{ "plan": "pro_monthly" | "pro_yearly" }`) $\to$ `201 Created` `OrderResponse`
  - `GET /api/billing/orders/{orderCode}` $\to$ `OrderResponse` (triggers PayOS fallback sync if `pending`)
  - `POST /api/billing/webhook/payos` (`@RequestBody String rawBody`) $\to$ `200 OK` / `400 Bad Request`

- [ ] **Step 1: Write failing tests in `BillingControllerIntegrationTests.java`**
  Mock `@MockitoBean private PayOsClient payOsClient;` (to verify webhook + order flows deterministically) and test:
  1. Unauthenticated `GET /api/billing/summary` & `POST /api/billing/orders` return `401`.
  2. `POST /api/billing/orders` creates a `pending` subscription row with `49000` (`pro_monthly`) and returns `qrCode` & `checkoutUrl`.
  3. `POST /api/billing/webhook/payos`: rejects invalid signature with `400`; when valid and `code == "00"` & `success != false`, activates Pro (`subscriptionTier == "pro"`), sets `expires_at ~ +30 days`; sending the exact webhook a second time is idempotent (does NOT extend `expires_at` to +60 days); PayOS test ping (`code == "00"`, valid signature, unknown `orderCode`) returns `200`.
  4. Early renewal while already active Pro stacks `+365 days` onto existing `expires_at`.
  5. `GET /api/billing/orders/{orderCode}` rejects access by a different user (`404`/`403`) and syncs `pending -> active` when `PayOsClient.getPaymentInfo` reports `PAID` with `amountPaid >= amountVnd`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cmd /c "cd backend && mvnw.cmd test -Dtest=BillingControllerIntegrationTests"`
  Expected: FAIL.

- [ ] **Step 3: Implement DTOs, `BillingService`, and `BillingController`**
  - In `BillingController.payOsWebhook(@RequestBody String rawBody)`: delegate raw JSON string directly to `BillingService.handlePayOsWebhook(rawBody)` using `com.fasterxml.jackson.databind.ObjectMapper`.
  - Verify `code == "00"` and `success != false` (`!root.path("success").isBoolean() || root.path("success").asBoolean()`).
  - Lock/atomically transition `pending -> active` before extending `expiresAt` or updating `User` tier.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cmd /c "cd backend && mvnw.cmd test -Dtest=BillingControllerIntegrationTests"`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add backend/src/main/java/com/givemepic/backend/billing/dto/ backend/src/main/java/com/givemepic/backend/billing/service/BillingService.java backend/src/main/java/com/givemepic/backend/billing/controller/BillingController.java backend/src/test/java/com/givemepic/backend/billing/controller/BillingControllerIntegrationTests.java
  git commit -m "feat(billing): add BillingController, PayOS order creation, polling sync, and webhook handler"
  ```

---

### Task 5: Wire `QuotaService` into `MediaController`, `MediaService`, and `ChatService`

**Files:**
- Modify: `backend/src/main/java/com/givemepic/backend/media/controller/MediaController.java`
- Modify: `backend/src/main/java/com/givemepic/backend/media/service/MediaService.java`
- Modify: `backend/src/main/java/com/givemepic/backend/chat/service/ChatService.java`
- Modify: `backend/src/test/java/com/givemepic/backend/media/controller/MediaControllerIntegrationTests.java`
- Modify: `backend/src/test/java/com/givemepic/backend/chat/controller/ChatStreamingControllerTests.java`

**Interfaces:**
- Consumes: `QuotaService` (`assertUploadAllowed`, `consumeUploadQuota`, `releaseStorage`, `consumeQuestionQuota`).
- Preserves existing contracts while adding optional `@RequestParam(required = false) Long sizeBytes` to `GET /api/media/presigned-url`.

- [ ] **Step 1: Add quota enforcement tests to `MediaControllerIntegrationTests` and `ChatStreamingControllerTests`**
  - Verify `GET /api/media/presigned-url?sizeBytes=...` returns `402` (`QUOTA_EXCEEDED`) when monthly photos or storage quota is exhausted.
  - Verify `POST /api/media/upload` returns `402` (NOT `500`) after 20 uploads on a Free user, and `objectStorageService.store` is NOT invoked on that 21st request.
  - Verify `POST /api/chat/stream` returns `402` (`QUOTA_EXCEEDED`) synchronously before returning an SSE stream when a Free user exceeds 30 monthly questions.

- [ ] **Step 2: Run affected tests to verify failure**
  Run: `cmd /c "cd backend && mvnw.cmd test -Dtest=MediaControllerIntegrationTests,ChatStreamingControllerTests"`
  Expected: FAIL.

- [ ] **Step 3: Wire `QuotaService` into `MediaController`, `MediaService`, and `ChatService`**
  - `MediaController.getPresignedUrl`: add `@RequestParam(required = false) Long sizeBytes` and pass `sizeBytes != null ? sizeBytes : 0L` to `mediaService.generateObjectKey(userId, subjectId, fileName, sizeBytes)`.
  - `MediaService`:
    - `generateObjectKey(...)`: call `quotaService.assertUploadAllowed(userId, sizeBytes)`.
    - `upload(...)` and `confirmUpload(...)`: call `quotaService.consumeUploadQuota(userId, sizeBytes)` **after** `clientUploadId` idempotency check, ownership check, and file size/content-type validation, and **strictly BEFORE** the `try { objectStorageService.store(...); ... } catch (RuntimeException)` block.
    - `delete(...)`: call `quotaService.releaseStorage(userId, media.getSizeBytes())`.
  - `ChatService`: call `quotaService.consumeQuestionQuota(userId)` in `answer()` and synchronously at the top of `answerStream()` before `streamExecutor.execute(...)`.

- [ ] **Step 4: Run full backend test suite**
  Run: `cmd /c "cd backend && mvnw.cmd test"`
  Expected: All tests PASS (`BUILD SUCCESS`).

- [ ] **Step 5: Commit**
  ```bash
  git add backend/src/main/java/com/givemepic/backend/media/ backend/src/main/java/com/givemepic/backend/chat/ backend/src/test/java/com/givemepic/backend/media/controller/MediaControllerIntegrationTests.java backend/src/test/java/com/givemepic/backend/chat/controller/ChatStreamingControllerTests.java
  git commit -m "feat(billing): enforce upload, storage, and chat quotas in MediaService and ChatService"
  ```

---

### Task 6: Frontend `qrcode.react`, `QuotaExceededError` in `api-client.ts` & `use-upload-queue.ts`, and `UpgradeProModal`

**Files:**
- Modify: `frontend/package.json` (install `qrcode.react`)
- Modify: `frontend/lib/api-client.ts`
- Modify: `frontend/lib/use-upload-queue.ts`
- Create: `frontend/components/UpgradeProModal.tsx`

**Interfaces:**
- Produces in `frontend/lib/api-client.ts`:
  - `class QuotaExceededError extends Error` (`quotaType?: "photos" | "questions" | "storage"`)
  - `interface BillingSummary` (`tier`, `activePlan`, `expiresAt`, `photosUsed`, `photosLimit`, `questionsUsed`, `questionsLimit`, `storageUsedBytes`, `storageQuotaBytes`)
  - `interface BillingOrder` (`orderCode`, `plan`, `amountVnd`, `status`, `qrCode`, `checkoutUrl`, `expiresAt`)
  - `getBillingSummary()`, `createBillingOrder(plan: "pro_monthly" | "pro_yearly")`, `getBillingOrderStatus(orderCode: number)`
  - `uploadMedia` sends `sizeBytes: file.size.toString()` in `/api/media/presigned-url` params.
  - Both `request()` and `askChatStream()` parse HTTP `402` (`code === "QUOTA_EXCEEDED"`) and throw `QuotaExceededError`.
- Produces in `frontend/components/UpgradeProModal.tsx`: `<UpgradeProModal open={boolean} onClose={() => void} summary={BillingSummary | null} onUpgraded={() => void} initialNotice={string | null} />`.

- [ ] **Step 1: Install `qrcode.react`**
  Run: `npm --prefix frontend install qrcode.react`

- [ ] **Step 2: Update `frontend/lib/api-client.ts` and `frontend/lib/use-upload-queue.ts`**
  - Add `QuotaExceededError`, billing interfaces, billing API functions, `sizeBytes` in `uploadMedia`, and `402` detection in `request()` and `askChatStream()`.
  - In `use-upload-queue.ts`: expose `quotaExceededMessage: string | null` and `clearQuotaError: () => void`. On `response.status === 402`, parse `data?.message` & `data?.quotaType`, mark item `"failed"`, set `quotaExceededMessage`, dispatch `window.dispatchEvent(new CustomEvent("open-upgrade-modal", { detail: { message: data?.message } }))`, and `break` out of the loop.

- [ ] **Step 3: Build `frontend/components/UpgradeProModal.tsx`**
  - Step 1: Monthly (49,000đ) / Yearly (490,000đ, Save 17%) selector, Free vs Pro comparison, current Pro status/expiry & extend button when already Pro.
  - Step 2: Render `QRCodeSVG` from `order.qrCode`, amount, order code, fallback `"Open PayOS checkout page"` link, and `setInterval` polling `getBillingOrderStatus(order.orderCode)` every 3s (cleaned up on unmount/close).
  - Step 3: On `status === "active"`, show success state and call `onUpgraded()`.

- [ ] **Step 4: Run frontend lint & production build**
  Run: `npm --prefix frontend run lint; if ($?) { npm --prefix frontend run build }`
  Expected: 0 ESLint errors, clean TypeScript & Next.js build.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/package.json frontend/package-lock.json frontend/lib/api-client.ts frontend/lib/use-upload-queue.ts frontend/components/UpgradeProModal.tsx
  git commit -m "feat(frontend): add UpgradeProModal with VietQR polling and QuotaExceededError handling"
  ```

---

### Task 7: Wire Global Modal in `layout.tsx`, Usage Bars in `profile/page.tsx`, and `402` Prompts in `chat` & `upload`

**Files:**
- Modify: `frontend/app/dashboard/layout.tsx`
- Modify: `frontend/app/dashboard/profile/page.tsx`
- Modify: `frontend/app/dashboard/chat/page.tsx`
- Modify: `frontend/app/dashboard/upload/page.tsx`

- [ ] **Step 1: Wire `UpgradeProModal` & `getBillingSummary()` in `frontend/app/dashboard/layout.tsx`**
  - Fetch `getBillingSummary()` alongside `getProfile()` on mount (triggering backend lazy expiry and hydrating `billingSummary`).
  - Listen for `window` `"open-upgrade-modal"` custom event (with optional `detail.message`) to open `UpgradeProModal` from any child page.
  - Desktop Topbar button: if `billingSummary?.tier === "pro"`, render `PRO` pill (opens modal to view expiry/extend); otherwise render `Upgrade Pro` button (`onClick` opens modal).
  - Mobile Profile Sheet: add `Upgrade Pro` / `Pro Plan` button row.
  - `onUpgraded`: refresh both `getProfile()` and `getBillingSummary()` and dispatch `"billing-updated"` window event.

- [ ] **Step 2: Add Billing & Usage section to `frontend/app/dashboard/profile/page.tsx`**
  - Load `getBillingSummary()` (and re-fetch on `"billing-updated"` event).
  - Render Free/Pro card with expiry date (if Pro), 3 usage progress bars (`Photos this month: X / limit`, `AI questions this month: X / limit`, `Storage: X MB / limit`), and `"Upgrade to Pro"` / `"Extend Pro"` button dispatching `"open-upgrade-modal"`.

- [ ] **Step 3: Handle `QuotaExceededError` in `frontend/app/dashboard/chat/page.tsx` and `frontend/app/dashboard/upload/page.tsx`**
  - In `chat/page.tsx`:
    - `handleSend`: if `sendError instanceof QuotaExceededError`, stop typewriter, remove **both** `tempUserMessage` and `tempAssistantMessage` from `messages`, restore `setQuestion(trimmed)`, and dispatch `open-upgrade-modal`.
    - `handleRetry`: if `retryError instanceof QuotaExceededError`, stop typewriter, remove **only** `tempAssistantMessage` (`m.messageId !== assistantId`), and dispatch `open-upgrade-modal`.
  - In `upload/page.tsx`: render `quotaExceededMessage` banner with `"Upgrade Pro"` button opening `UpgradeProModal`.

- [ ] **Step 4: Verify full frontend lint + build & run backend full test suite**
  Run: `npm --prefix frontend run lint; if ($?) { npm --prefix frontend run build }; if ($?) { cmd /c "cd backend && mvnw.cmd test" }`
  Expected: Frontend lint & build pass cleanly; all backend tests pass.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/app/dashboard/layout.tsx frontend/app/dashboard/profile/page.tsx frontend/app/dashboard/chat/page.tsx frontend/app/dashboard/upload/page.tsx
  git commit -m "feat(frontend): integrate UpgradeProModal, profile usage bars, and 402 prompts"
  ```
