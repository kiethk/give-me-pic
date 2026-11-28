# Design Specification: PayOS Billing (VietQR) & Monthly Quota Enforcement

**Date**: 2026-11-27  
**Status**: Ready for Approval (Builder Check Completed)  
**Scope**: Backend (`com.givemepic.backend.billing`, `auth`, `media`, `chat`, `common`), Flyway `V12`, Frontend (`UpgradeProModal`, `layout.tsx`, `profile`, `upload`, `chat`)

---

## 1. Intent & Problem Statement

Currently, `Upgrade Pro` in the desktop topbar is a static button, `subscriptions` and `usage_monthly` tables from `docs/plan.md` have not been migrated, and `users.subscription_tier` / `storage_quota_bytes` are never enforced.

**Goal**: Implement production-ready monetization using **PayOS (VietQR)** for real VND payments, backed by signed webhook verification, real monthly photo/question quotas, storage limits, and automatic subscription expiry handling.

---

## 2. Goals & Non-Goals

### Goals
- **Real VietQR Payments via PayOS**: Create dynamic payment orders (`pro_monthly`, `pro_yearly`), render VietQR in-app inside `UpgradeProModal`, and activate Pro automatically via HMAC-SHA256 signed webhook (plus fallback status polling against PayOS API).
- **Real Quota & Storage Enforcement**:
  - **Free**: 20 photos/month, 30 AI questions/month, 500 MB storage (`524,288,000` bytes).
  - **Pro**: 500 photos/month, 500 AI questions/month, 10 GB storage (`10,737,418,240` bytes).
- **Two Paid Plans (VND)**:
  - `pro_monthly`: **49,000 VND** / 30 days.
  - `pro_yearly`: **490,000 VND** / 365 days.
- **Usage Visibility & Upgrade Prompts**: Show real monthly usage & storage bars on Profile, replace static `Upgrade Pro` with active modal trigger (or `PRO` badge when active), add mobile entry point, and catch HTTP `402 Payment Required` in Upload & Chat to prompt immediate upgrade.
- **Expiry Handling**: Automatically downgrade expired Pro users back to Free without deleting their existing files.

### Non-Goals
- International card gateways (Stripe / Lemon Squeezy) in this release (can be added later behind the `PaymentGateway` interface).
- Automatic recurring debit (VietQR requires user scan/transfer per billing cycle; early renewals stack onto `expires_at`).
- Refund UI or Admin backoffice dashboard.

---

## 3. Evaluated Approaches & Tradeoffs

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| **Approach A: Native `billing` module using Spring `RestClient` + Flyway `V12`** | Zero third-party SDK conflicts with Spring Boot 4.1 / Java 21 (`pom.xml`); matches `GeminiLlmProvider` style; adheres strictly to `docs/plan.md` schema & `spring-boot-module-structure.md`. | Requires ~40 lines of custom PayOS HMAC-SHA256 signing & verification code. | **Selected** |
| **Approach B: `payos-java` SDK + separate `payment_orders` table** | Less manual HMAC code. | Pulls transitive Jackson/HTTP client dependencies with high conflict risk on Spring Boot 4.1 / Java 21; diverges from `docs/plan.md`. | Ruled out |

---

## 4. Database Design (Flyway `V12__create_billing_tables.sql`)

Follows `.agents/rules/database-schema.md` (UUID PKs, `TIMESTAMPTZ`, explicit `ON DELETE`).

### Table 1: `subscriptions`
Stores both payment orders (pending/cancelled/expired) and active/past subscription periods.
```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_code BIGINT NOT NULL UNIQUE,
    plan VARCHAR(20) NOT NULL,               -- 'pro_monthly' | 'pro_yearly'
    amount_vnd INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,             -- 'pending' | 'active' | 'expired' | 'cancelled' | 'failed'
    payment_provider VARCHAR(30) NOT NULL DEFAULT 'payos',
    payment_reference VARCHAR(255),          -- PayOS paymentLinkId / transaction reference
    checkout_url VARCHAR(500),
    qr_code TEXT,
    started_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, status);
CREATE INDEX idx_subscriptions_expires_at ON subscriptions(expires_at) WHERE status = 'active';
```

### Table 2: `usage_monthly`
Tracks monthly upload and AI chat counts per user (`year_month` format: `'YYYY-MM'` in UTC).
```sql
CREATE TABLE usage_monthly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year_month VARCHAR(7) NOT NULL,
    photos_uploaded_count INTEGER NOT NULL DEFAULT 0,
    questions_asked_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_usage_monthly_user_month UNIQUE (user_id, year_month)
);
```

### Existing `users` Table Columns (Already Migrated in `V1`)
- `subscription_tier` (`'free'` or `'pro'`)
- `storage_quota_bytes` (`524288000` for Free, `10737418240` for Pro)
- `storage_used_bytes` (maintained transactionally on upload/confirmUpload and media delete)

### Data Backfill in `V12` (User Confirmed)
At migration time, `V12` backfills accurate usage for existing users so profile storage bars and delete accounting do not drift:
- `users.storage_used_bytes` is initialized from `COALESCE(SUM(media_files.size_bytes), 0)` per user.
- `usage_monthly` for the current UTC month (`to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')`) is seeded from `media_files` where `media_files.created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')` and `chat_messages` (`role = 'user'`) joined via `chat_sessions` where `chat_messages.created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')` (filtering strictly on `chat_messages.created_at`, never `chat_sessions.created_at`).

---

## 5. Backend Architecture (`com.givemepic.backend.billing`)

### Module Boundary Rules
- `billing` is a new top-level business module under `com.givemepic.backend.billing` (`controller`, `service`, `repository`, `dto`, `entity`).
- Cross-module interaction goes strictly through services:
  - Atomic updates on `users` (`incrementStorageUsedIfWithinQuota`, `decrementStorageUsed`, `activateProTier`, `downgradeToFreeTier`) live inside `AuthService` (`UserRepository`) — `QuotaService` and `BillingService` never touch `UserRepository` directly.
  - `MediaService` and `ChatService` call `QuotaService` (`billing/service`) — one-way dependency, no circular references.
- `BackendApplication.java` adds `@EnableScheduling` so `@Scheduled` hourly expiry downgrades actually execute.

### PayOS Integration (`PayOsClient`)
- **Configuration (`application.yml`)**:
  - `app.payos.base-url` (default `https://api-merchant.payos.vn`)
  - `app.payos.client-id` (`${PAYOS_CLIENT_ID:}`)
  - `app.payos.api-key` (`${PAYOS_API_KEY:}`)
  - `app.payos.checksum-key` (`${PAYOS_CHECKSUM_KEY:}`)
  - `app.payos.return-url` (`${PAYOS_RETURN_URL:http://localhost:3000/dashboard/profile?payment=success}`)
  - `app.payos.cancel-url` (`${PAYOS_CANCEL_URL:http://localhost:3000/dashboard/profile?payment=cancelled}`)
- **Blank-Key Guard (Mandatory)**:
  - If `client-id`, `api-key`, or `checksum-key` is null or blank, `PayOsClient` immediately throws `503 Service Unavailable` ("Payment gateway is not configured") for order creation / status sync, and webhook verification immediately fails closed (`false` -> `400 Bad Request`). Never compute or verify HMAC-SHA256 using an empty key.
- **Order Code Generation**: Positive integer under `9_007_199_254_740_991L` (e.g. epoch seconds * 1000 + 3 random digits, retried if unique constraint collides).
- **Create Payment Link (`POST /v2/payment-requests`)**:
  - Headers: `x-client-id`, `x-api-key`.
  - Signature input: `amount={amount}&cancelUrl={cancelUrl}&description={description}&orderCode={orderCode}&returnUrl={returnUrl}` hashed with `HMAC-SHA256(checksumKey)` as lowercase hex.
  - `description`: max 25 chars (e.g. `GMP PRO MONTHLY` / `GMP PRO YEARLY`).
  - `expiredAt`: Unix epoch seconds `now + 15 minutes`.
- **Get Payment Status (`GET /v2/payment-requests/{orderCode}`)**:
  - Fallback sync used by polling endpoint if PayOS webhook cannot reach localhost during dev or arrives late.
- **Webhook Verification (`POST /api/billing/webhook/payos`)**:
  - Public endpoint permitted in `SecurityConfig`. Accepts `@RequestBody String rawBody` and parses it via `com.fasterxml.jackson.databind.ObjectMapper` (avoiding Jackson 2/3 binder mismatches on Spring Boot 4.1).
  - Extracts all key-value pairs inside `data` JSON object, sorts keys alphabetically, joins as `key=value` separated by `&` (`null` rendered as empty string `""`), computes `HMAC-SHA256`, and compares in constant time (`MessageDigest.isEqual`) against top-level `signature`.
  - Returns `400 Bad Request` on invalid signature.
  - Only activates Pro when `code == "00"` and `success != false`. Handles PayOS webhook URL registration/test ping cleanly (if signature validates and order does not exist, log warning and return `200 OK`).

### Subscription Activation & Idempotency (`BillingService`)
- `activateSubscription(orderCode, paymentReference, paidAmountVnd)`:
  - Runs in a `@Transactional` method.
  - Atomically locks/updates subscription where `order_code = ? AND status = 'pending'`. If already `'active'`, return idempotently without extending twice.
  - Validates `paidAmountVnd >= subscription.amountVnd`.
  - Computes new expiry: if user already has an active Pro subscription (`expires_at > now`), `newStartedAt = existingActive.startedAt`, `newExpiresAt = existingActive.expiresAt + durationDays` (and marks old active row superseded/expired or updates); otherwise `newStartedAt = now`, `newExpiresAt = now + durationDays` (30 days for monthly, 365 days for yearly).
  - Sets `status = 'active'`, `payment_reference`, `started_at`, `expires_at`.
  - Updates `User` via `AuthService`: `subscriptionTier = 'pro'`, `storageQuotaBytes = 10_737_418_240L`.

### Atomic Quota & Expiry (`QuotaService`)
- **Limits Table**:
  - Free: 20 photos/month, 30 questions/month, `524_288_000L` bytes.
  - Pro: 500 photos/month, 500 questions/month, `10_737_418_240L` bytes.
- **Lazy Expiry Check**: Before reading limits or returning `BillingSummaryResponse`, check if user's `subscriptionTier == 'pro'` has no active unexpired subscription (`expires_at > now()`); if expired, downgrade immediately (`subscriptionTier = 'free'`, `storageQuotaBytes = 524_288_000L`, mark expired rows `'expired'`).
- **Scheduled Downgrade**: `@Scheduled(cron = "0 0 * * * *")` checks `subscriptions WHERE status = 'active' AND expires_at < now()` and downgrades users without active remaining Pro rows.
- **Upload Quota (`MediaService`)**:
  - `GET /api/media/presigned-url` & `generateObjectKey`: accepts optional `@RequestParam(required = false) Long sizeBytes` (defaults to `0L` if omitted for backward compatibility; builder call). Updated `frontend/lib/api-client.ts` always sends `file.size.toString()`. Calls `quotaService.assertUploadAllowed(userId, sizeBytes)` before issuing an S3 presigned PUT URL (checks monthly count `< limit` and `storageUsedBytes + sizeBytes <= storageQuotaBytes` without incrementing yet; throws `402 Payment Required` with `QUOTA_EXCEEDED`).
  - `confirmUpload` and `upload`: calls `quotaService.consumeUploadQuota(userId, sizeBytes)` **after** `clientUploadId` idempotency check, subject ownership check, and file size/content-type validation, and **strictly BEFORE** the `try { objectStorageService.store(...); ... } catch (RuntimeException ex)` block (so `402 QuotaExceededException` is never swallowed into `500`, and no orphaned file is uploaded to MinIO/Supabase Storage on quota failure; `@Transactional` rolls back quota if S3 `store()` subsequently fails). `consumeUploadQuota` runs:
    1. Atomic `usage_monthly` increment: `INSERT INTO usage_monthly ... ON CONFLICT DO UPDATE SET photos_uploaded_count = photos_uploaded_count + 1 WHERE photos_uploaded_count < :limit` (0 rows affected $\to$ `402 QUOTA_EXCEEDED`).
    2. `authService.incrementStorageUsedIfWithinQuota(userId, sizeBytes)` (0 rows affected $\to$ rollback & `402 QUOTA_EXCEEDED`).
  - `delete`: calls `quotaService.releaseStorage(userId, media.getSizeBytes())` (which delegates to `authService.decrementStorageUsed`, clamped via `GREATEST(0, storage_used_bytes - sizeBytes)`), keeping `MediaService` coupled only to `QuotaService`. Monthly upload count is NOT refunded on delete so users cannot upload/delete infinitely to bypass monthly OCR/embedding costs.
- **Chat Quota (`ChatService`)**:
  - In `answer()` and BEFORE launching `streamExecutor.execute(...)` in `answerStream()`: calls `quotaService.consumeQuestionQuota(userId)` which atomically increments `questions_asked_count` when `< limit`, throwing `402 QUOTA_EXCEEDED` before Gemini LLM is called.

### REST API Endpoints (`BillingController`)
- `GET /api/billing/summary` (Authenticated): returns `tier`, `activePlan`, `expiresAt`, `photosUsed`, `photosLimit`, `questionsUsed`, `questionsLimit`, `storageUsedBytes`, `storageQuotaBytes`.
- `POST /api/billing/orders` (Authenticated): `{ "plan": "pro_monthly" | "pro_yearly" }` $\to$ creates PayOS order, returns `{ orderCode, plan, amountVnd, status, qrCode, checkoutUrl, expiresAt }`.
- `GET /api/billing/orders/{orderCode}` (Authenticated): verifies order belongs to `userId`; if `pending`, syncs with PayOS `GET /v2/payment-requests/{orderCode}`; activates Pro if `PAID`; returns current order status.
- `POST /api/billing/webhook/payos` (Public): verifies HMAC-SHA256 signature and activates Pro idempotently.

---

## 6. Frontend Architecture (`frontend/`)

1. **`qrcode.react` Dependency**: Install `qrcode.react` to render PayOS `qrCode` EMVCo string cleanly as an SVG QR code inside the modal.
2. **Global `UpgradeProModal` & Billing Trigger**:
   - Component `frontend/components/UpgradeProModal.tsx`:
     - **Step 1 (Plan Selection / Pro Status)**: Toggle Monthly (49,000 VND) / Yearly (490,000 VND, "Save 17%"), clear Free vs Pro comparison table, CTA "Pay with VietQR". If already Pro, shows current Pro expiry & option to extend subscription.
     - **Step 2 (VietQR Payment View)**: Displays rendered QR SVG, amount (`49,000 đ` / `490,000 đ`), order code, 15-min validity note, "Open PayOS Checkout Page" external fallback link, and live "Waiting for payment..." indicator polling `GET /api/billing/orders/{orderCode}` every 3 seconds.
     - **Step 3 (Success View)**: When status becomes `active`, displays confirmation, calls `onUpgraded()` callback to refresh profile & billing summary in layout/pages.
   - Modal triggered from:
     - Desktop Topbar (`layout.tsx`): Calls `GET /api/billing/summary` alongside `getProfile()` on mount (triggering lazy expiry check and syncing `expiresAt` / `tier`) and displays `Upgrade Pro` button or active `PRO` badge.
     - Mobile Profile Sheet (`layout.tsx`): adds `Upgrade Pro` / `Manage Pro Plan` action row.
     - Profile page (`profile/page.tsx`): adds Billing & Usage section with 3 progress bars (Monthly Photos, Monthly AI Questions, Storage) + `Upgrade Pro` / `Renew` button.
     - Quota `402` Interception:
       - `api-client.ts`: parses HTTP `402` (`QUOTA_EXCEEDED`) into typed `QuotaExceededError` in **both** `request()` and `askChatStream()` (handling `!response.ok` before stream reading).
       - `dashboard/chat/page.tsx`: when `handleSend` catches `QuotaExceededError`, stop typewriter, **remove** both optimistic `tempUserMessage` and `tempAssistantMessage` from `messages`, restore `trimmed` question text into the input box, show a concise upgrade prompt, and open `UpgradeProModal`. When `handleRetry` catches `QuotaExceededError`, remove only `tempAssistantMessage` (since `handleRetry` does not re-add a user message) and open `UpgradeProModal`.
       - `use-upload-queue.ts`: catching `QuotaExceededError` pauses/marks item clearly and offers/triggers `"Limit reached — Upgrade Pro"` opening `UpgradeProModal`.

---

## 7. Left to Builder
- Exact Tailwind styling tokens for `UpgradeProModal` and progress bars matching existing `#0050cb` / `#f8fafc` palette.
- Exact `RestClient` timeout settings for `PayOsClient`.
- Custom `QuotaExceededException` handling in Spring `GlobalExceptionHandler` so all `402` responses share a consistent JSON shape `{ status: 402, code: "QUOTA_EXCEEDED", message: "...", quotaType: "photos" | "questions" | "storage" }`.

---

## 8. Verification Plan
1. **Backend Tests**:
   - `PayOsClientTests`: HMAC-SHA256 signature generation for create-order and webhook verification (valid, tampered payload, missing signature).
   - `BillingServiceTests`: Idempotent activation, early renewal stacking `expires_at`, fallback PayOS sync on `pending -> PAID`, expiry downgrade.
   - `QuotaServiceIntegrationTests`: Atomic photo/question/storage caps for Free vs Pro, `402 QUOTA_EXCEEDED` thrown at limit + 1, storage decrement on delete.
2. **Frontend Verification**:
   - `npm run lint` and `npm run build` pass with zero TypeScript errors.
   - Browser/UI verification of `UpgradeProModal` plan switching, QR view (mocked/sandbox), usage bars on Profile, and `402` prompt handling.
