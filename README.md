# Give Me Pic 📸 — AI-Powered Multimodal Study Companion

> Transform classroom whiteboard photos and lecture slides into an interactive, citation-backed knowledge base using Multimodal Retrieval-Augmented Generation (RAG).

[![CI Pipeline](https://github.com/kiethk/give-me-pic/actions/workflows/ci.yml/badge.svg)](https://github.com/kiethk/give-me-pic/actions/workflows/ci.yml)
[![Production Deploy](https://github.com/kiethk/give-me-pic/actions/workflows/deploy.yml/badge.svg)](https://github.com/kiethk/give-me-pic/actions/workflows/deploy.yml)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2015%20(App%20Router)-black?logo=next.js)](https://nextjs.org/)
[![Spring Boot](https://img.shields.io/badge/Backend-Spring%20Boot%203.4%20%2F%20Java%2021-brightgreen?logo=springboot)](https://spring.io/projects/spring-boot)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20pgvector-blue?logo=postgresql)](https://github.com/pgvector/pgvector)
[![Gemini](https://img.shields.io/badge/AI%20Engine-Google%20Gemini%20API-orange?logo=google)](https://ai.google.dev/)

---

## 📌 Executive Summary & Business Context

University students and self-learners routinely capture hundreds of lecture slides, whiteboard notes, and textbook diagrams on their smartphones. However, this visual data remains trapped in unstructured camera rolls—unsearchable, difficult to review, and impossible to query quickly during exam preparation.

**Give Me Pic** bridges this gap as an **offline-first, mobile-optimized PWA**. It automatically extracts text, formulas, and diagrams via multimodal OCR, indexes content with vector embeddings, and delivers an AI tutor capable of synthesizing answers while citing the exact photo sources.

---

## 🚀 Key Features & Capabilities

### 1. Multimodal RAG & Grounded Q&A
- **Vision-Driven OCR Pipeline**: Processes raw lecture photos (whiteboards, handwritten notes, printed slides) via Gemini Multimodal API to extract high-accuracy text and mathematical markdown.
- **Vector Search with `pgvector`**: Chunks OCR outputs and computes 768-dimensional dense embeddings (`text-embedding-004`), stored in PostgreSQL for cosine-similarity semantic search.
- **Citation-Backed Answers**: Every assistant response includes verifiable citations linking directly to the specific source photo and chunk index.
- **Subject-Scoped Context**: Filter queries across all enrolled subjects or isolate retrieval to a specific course.

### 2. Enterprise Authentication & Security
- **Dual-Mode Auth**: Standard credentials (BCrypt password hashing) and native **Google OAuth 2.0** with Google Identity Services (GIS).
- **Stateless JWT + Rotating HttpOnly Cookies**: 15-minute access tokens with hardened HTTP-only refresh tokens stored in PostgreSQL (`refresh_tokens`), preventing XSS and CSRF token theft.
- **Granular User Profiles**: Self-service profile management, avatars, and persistent storage quota tracking.

### 3. Progressive Web App (PWA) & Mobile-First UX
- **Installable PWA**: Standalone mobile experience with service worker caching via `@ducanh2912/next-pwa`.
- **Direct Camera Capture**: In-app camera integration and multi-file picker with automatic HEIC/JPEG normalization.
- **Resilient Upload Queue**: Background queue with auto-retry, offline detection, recovery mechanisms, and dismissible state.
- **iOS Viewport Optimization**: Minimum 16px form inputs and viewport restrictions preventing unwanted Safari auto-zoom.

### 4. Modern Desktop & Adaptive Dashboard
- **Sleek Top Navigation**: High-density desktop topbar with clean typography, flush active indicator tabs, and quick-action user menu (Vercel/Linear design principles).
- **Dedicated Chat History Sidebar**: Single left sidebar in `Ask AI` view for frictionless conversation switching without visual clutter.

---

## 🏗️ System Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │               Client Devices                 │
                    │   Mobile PWA (iOS/Android) · Desktop Web     │
                    └──────────────────────┬───────────────────────┘
                                           │ HTTPS (CORS / HttpOnly)
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │          Frontend (Next.js 15)               │
                    │   App Router · Tailwind CSS · TypeScript     │
                    │   Hosted on Vercel                           │
                    └──────────────────────┬───────────────────────┘
                                           │ REST API (/api/*)
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │       Backend (Spring Boot 3.4 / Java 21)    │
                    │   Modular Monolith Architecture              │
                    ├───────────┬──────────────┬───────────────────┤
                    │   auth    │   subject    │   media & chat    │
                    └─────┬─────┴──────┬───────┴─────────┬─────────┘
                          │            │                 │
              ┌───────────┴────┐  ┌────┴────────────┐  ┌─┴────────────────┐
              │ PostgreSQL 16  │  │  S3 / MinIO     │  │ Google Gemini    │
              │  + pgvector    │  │  Object Storage │  │ Multimodal API   │
              │  Flyway (V1-11)│  │  (Lecture Docs) │  │ OCR + Embeddings │
              └────────────────┘  └─────────────────┘  └──────────────────┘
```

### Module Breakdown (Spring Boot Modular Monolith)
- `com.givemepic.backend.auth`: User registration, login, JWT issuance, Google ID token verification, refresh token rotation.
- `com.givemepic.backend.subject`: Subject lifecycle management (CRUD, colors, semester tagging).
- `com.givemepic.backend.media`: Multipart file upload, MinIO/S3 storage integration, async OCR trigger.
- `com.givemepic.backend.chat`: Vector search, Gemini RAG orchestration, citation mapping, chat session history.
- `com.givemepic.backend.common`: Global exception handling, security filters, rate limiting, and shared DTOs.

---

## 🛠️ Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Backend** | Spring Boot 3.4 (Java 21) | Modular Monolith, Spring Security, Spring Data JPA, RestClient |
| **Database** | PostgreSQL 16 + `pgvector` | Cosine vector similarity search (768-dim), Flyway migrations (V1–V11) |
| **Object Storage** | MinIO (Local) / AWS S3 (Prod) | Secure photo storage with pre-signed URLs and mime normalization |
| **AI / LLM** | Google Gemini 1.5 & Embedding | Vision OCR, `text-embedding-004` (768d), conversational RAG generation |
| **Frontend** | Next.js 15 (React 19) | App Router, TypeScript, Tailwind CSS, `@ducanh2912/next-pwa` |
| **Authentication** | JWT + Google OAuth 2.0 | HttpOnly secure cookies, access token memory storage, refresh token table |
| **DevOps / CI-CD** | GitHub Actions | Automated Maven + Postgres service tests, Next.js lint/build, Vercel & Render deploy |

---

## 💼 CV / Resume Highlights (For Software Engineering & Fullstack Roles)

If you are featuring this project on your CV or LinkedIn profile, here are ready-to-use achievement bullet points:

- **Fullstack & RAG Architecture**:
  > *"Architected and built an end-to-end Multimodal RAG platform using Spring Boot 3.4 (Java 21), Next.js 15, and PostgreSQL `pgvector`, indexing visual lecture photos and providing AI Q&A with exact source citations."*
- **Vector Search & AI Integration**:
  > *"Engineered an automated ingestion pipeline utilizing Google Gemini Multimodal API for whiteboard/handwritten OCR, chunking text, and computing 768-dimensional embeddings for low-latency cosine similarity retrieval."*
- **Enterprise-Grade Security**:
  > *"Implemented dual authentication with BCrypt and Google OAuth 2.0, utilizing short-lived stateless JWTs and rotating HttpOnly refresh tokens in PostgreSQL to eliminate XSS/CSRF exposure."*
- **Offline-First PWA & Mobile UX**:
  > *"Developed an installable PWA with Next.js App Router and service workers, featuring native camera capture, resilient offline upload queues with auto-recovery, and adaptive desktop/mobile navigation."*
- **Automated CI/CD & Cloud Infrastructure**:
  > *"Configured GitHub Actions CI/CD with containerized PostgreSQL service integration tests, Flyway database versioning (11 migrations), and automated production deployments to Render and Vercel."*

---

## 🗄️ Database Schema Overview

```sql
users (id, email, password_hash, display_name, avatar_url, google_id, subscription_tier, storage_quota_bytes, storage_used_bytes)
refresh_tokens (id, user_id, token_hash, expires_at, revoked)
subjects (id, user_id, name, description, color_hex, semester, is_archived)
media_files (id, user_id, subject_id, file_name, stored_name, content_type, size_bytes, storage_path, ocr_status, client_upload_id)
ocr_results (id, media_id, raw_text, confidence_score, ocr_engine, error_message, processed_at)
document_chunks (id, media_id, ocr_result_id, chunk_index, content, token_count, embedding_status)
chunk_embeddings (id, chunk_id, embedding vector(768), model_name)
chat_sessions (id, user_id, subject_id, title)
chat_messages (id, session_id, role, content)
message_citations (id, message_id, chunk_id, media_id, similarity_score)
```

---

## 💻 Local Development Setup

### Prerequisites
- **Docker & Docker Compose**
- **Java 21 (JDK)**
- **Node.js 20+ & npm**
- **Google Gemini API Key** ([Get here](https://aistudio.google.com/))

### 1. Clone & Environment Configuration
```bash
git clone https://github.com/kiethk/give-me-pic.git
cd give-me-pic
```

Create `backend/src/main/resources/application-local.yml` (or set environment variables):
```yaml
gemini:
  api-key: ${GEMINI_API_KEY}
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### 2. Start Supporting Services (PostgreSQL + MinIO)
```bash
docker compose up -d
```
- PostgreSQL with `pgvector`: `localhost:5432` (db: `givemepic_db`, user: `givemepic`, pass: `secret`)
- MinIO S3 Console: `http://localhost:9001` (user: `minioadmin`, pass: `minioadmin`)

### 3. Launch Backend
```bash
cd backend
./mvnw spring-boot:run
```
Backend API starts at `http://localhost:8080`. Flyway automatically executes migrations `V1` to `V11`.

### 4. Launch Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 🧪 Testing & Verification

```bash
# Backend unit & integration tests
cd backend
./mvnw test

# Frontend linting and production build
cd frontend
npm run lint
npm run build
```

---

## 📈 Roadmap & Next Phases

- [x] **Phase 1**: Authentication (Email + Google OAuth) & Media Storage MVP
- [x] **Phase 2**: Multimodal RAG Pipeline (Gemini OCR, pgvector similarity, Chat with Citations)
- [x] **Phase 3**: Reliability & Offline Queue (PWA, Service Worker, Upload Resiliency)
- [x] **Phase 4**: UX Polish (SaaS Topbar, Clean Typography, Mobile Sheet Optimizations)
- [ ] **Phase 5**: Stripe/Payment Subscription Tiers (`subscriptions`, `usage_monthly`)
- [ ] **Phase 6**: HNSW Vector Indexing & Real-time Websocket Streaming
- [ ] **Phase 7**: Native Mobile Application (React Native / Flutter)
