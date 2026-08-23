# Give Me Pic — Full Roadmap (Phase 0 → Mobile App)

> Use this alongside `docs/plan.md`. This file lists _what_ each phase covers;
> `plan.md` tracks _current status_ (Completed / In Progress / Not Started).
> When a phase starts, copy its checklist into `plan.md`'s status sections.

---

## Phase 0 — Foundation (mostly done)

Goal: local dev environment fully working, nothing user-facing yet.

- [x] Monorepo structure (`backend/`, `frontend/`, root `docker-compose.yml`)
- [x] PostgreSQL + pgvector running in Docker
- [x] Spring Boot project scaffolded, modular monolith package structure
- [x] Next.js project scaffolded (App Router, TypeScript, Tailwind), production build passes
- [x] Full database schema designed for all modules
- [ ] MinIO running in Docker, backend wired to it (in progress)

**Exit criteria**: `docker-compose up -d` brings up Postgres + MinIO, backend connects to both, `./mvnw spring-boot:run` starts cleanly.

---

## Phase 1 — Auth + Media MVP

Goal: a user can register, log in, upload a photo, tag it to a subject, and see it again. No OCR, no AI yet.

- [x] Auth backend: `User` entity, register/login, JWT via httpOnly cookie
- [ ] Media backend: `Photo` entity, `POST /api/media/upload` (writes to MinIO), `GET /api/media` (list, filterable by subject)
- [ ] Subject backend: `Subject` entity, create/edit/archive endpoints
- [ ] Frontend: register/login pages, calling the auth API with `credentials: include`
- [ ] Frontend: subject management (create/list/archive)
- [ ] Frontend: capture/upload page — `<input type="file" accept="image/*" capture="environment">`
- [ ] Frontend: photo grid page, grouped by subject

**Exit criteria**: a real end-to-end manual test — register a new account, create a subject, upload a photo tagged to it, refresh the page, see it in the grid.

---

## Phase 2 — RAG Pipeline (the core differentiator)

Goal: uploaded photos become searchable via natural-language questions, answers cite the source photo.

- [ ] OCR service: run OCR on every uploaded photo (async, background job — not blocking the upload response), write to `ocr_results`
- [ ] Chunking service: split `ocr_results.raw_text` into `document_chunks`
- [ ] Embedding service: call the embedding API for each chunk, store in `chunk_embeddings`
- [ ] Retry/failure handling: `ocr_status` transitions (`pending` → `processing` → `completed`/`failed`), a way to see and retry failed photos
- [ ] Chat backend: `POST /api/chat` — embed the question, similarity search, build prompt, call LLM, store `chat_message` + `message_citations`
- [ ] Frontend: chat UI (NotebookLM-style) — ask a question, see the answer, click a citation to jump to the source photo
- [ ] Frontend: per-subject chat scope (optional filter) vs. all-photos scope

**Exit criteria**: upload a few different photos on different subjects, ask a question that's only answerable from one of them, get a correct answer with the correct photo cited — not a random or unrelated one.

---

## Phase 3 — Reliability & Offline-First

Goal: works well on a flaky mobile connection, which is the primary real-world usage pattern (student on campus wifi/mobile data).

- [ ] Frontend: client-generated temp IDs for photos captured offline, `upload_status: pending` shown in UI immediately
- [ ] Frontend: background sync — retry queued uploads when connection returns
- [ ] Backend: idempotent upload endpoint (safe to retry the same upload without creating duplicates)
- [ ] Basic rate limiting / abuse protection on upload and chat endpoints
- [ ] Error states designed for every async step (OCR failed, embedding failed, LLM call failed) — user sees _something_ actionable, not a silent gap

**Exit criteria**: turn off wifi mid-capture, take 3 photos, turn wifi back on — all 3 upload automatically without user action.

---

## Phase 4 — PWA (installable web app, before native mobile)

Goal: the Next.js app installs like a real app on a phone home screen, works offline for viewing at least.

- [ ] `@ducanh2912/next-pwa` configured, service worker enabled
- [ ] `manifest.json` — app name, icons, theme color
- [ ] Offline fallback page / cached shell for previously-viewed photos
- [ ] Push notification permission flow (optional at this stage, needed later for "OCR done" notifications)
- [ ] Mobile-first UI pass: camera capture button prominent, grid touch-friendly, chat input usable one-handed

**Exit criteria**: "Add to Home Screen" on a real phone, app opens without browser chrome, camera capture works directly from the home screen icon.

---

## Phase 5 — Monetization

Goal: free tier limits enforced, a path to paid exists, without blocking usage that's already working.

- [ ] `subscriptions` + `usage_monthly` tables wired into real checks (not just schema)
- [ ] Upload endpoint checks `storage_used_bytes` / `storage_quota_bytes` before accepting
- [ ] Chat endpoint checks monthly question count against the plan's limit
- [ ] Payment integration (MoMo/VNPay/ZaloPay per the schema's `payment_provider` field) for upgrading to premium
- [ ] Frontend: usage indicators (storage used, questions remaining this month), upgrade prompt when near/at limit

**Exit criteria**: a free-tier account hits a limit and is blocked with a clear message and upgrade path; a premium account is not blocked.

---

## Phase 6 — Production Hardening

Goal: safe to have real strangers use it, not just you and classmates testing.

- [ ] Move off Gemini free tier to a paid/production API key with proper quota for expected load
- [ ] Move off local MinIO to real S3-compatible cloud storage (S3, R2, etc.) — config-only change per the architecture decision made earlier
- [ ] Environment-based config (dev/staging/prod), secrets never committed (confirm `.env`/`.gitignore` discipline)
- [ ] HTTPS everywhere, cookies set with `Secure` + correct `SameSite` for production domains
- [ ] Basic logging/monitoring (at minimum: error logs somewhere you can actually check, not just console output on your laptop)
- [ ] Database backups configured for the production Postgres instance
- [ ] Deploy backend + frontend to real hosting (e.g. Railway/Render for backend, Vercel for frontend, or a single VPS if preferred)
- [ ] Domain name + DNS pointed at the deployed app

**Exit criteria**: the app is reachable at a real URL, by someone who is not you, on their own phone, on their own network, and it works.

---

## Phase 7 — Native Mobile App

Goal: an actual installable app on the Play Store / App Store, not just a PWA.

Two realistic paths — decide based on how much of the Phase 0–6 frontend code you want to reuse:

**Path A — Wrap the existing PWA (faster, less native feel)**

- [ ] Use Capacitor (or similar) to wrap the existing Next.js PWA into a native shell
- [ ] Native camera API integration (better than the web `<input capture>` — faster, more reliable)
- [ ] Push notifications via native APIs (FCM for Android, APNs for iOS)
- [ ] Store listing prep: icons, screenshots, privacy policy page, app description

**Path B — Separate native app (slower, better UX, more work)**

- [ ] Choose a framework: React Native (reuses more React knowledge from the Next.js work) or Flutter
- [ ] Rebuild the UI natively, calling the _same_ backend API (no backend changes needed — this is the payoff of having a clean REST API from Phase 1 onward)
- [ ] Native camera, native push notifications, native offline storage

**Exit criteria**: the app is installable from the Play Store (Android) and/or App Store (iOS), a real user finds it by searching, installs it, and it works without you personally walking them through setup.

---

## How to use this with your coding agent

For each phase, don't hand the whole phase over at once. Pick one unchecked
item, give it to the agent as a single scoped task (per the scope-discipline
rule in `AGENTS.md`), confirm it works, check it off in `plan.md`, then move
to the next item. A phase is "done" when every item in it is checked and the
exit criteria has been manually verified by you — not when the agent says
it's done.
