# Give Me Pic 📸 — AI-Powered Multimodal Study Companion

> Transform classroom whiteboard photos and lecture slides into an interactive, citation-backed knowledge base using Multimodal Retrieval-Augmented Generation (RAG).

[![CI Pipeline](https://github.com/kiethk/give-me-pic/actions/workflows/ci.yml/badge.svg)](https://github.com/kiethk/give-me-pic/actions/workflows/ci.yml)
[![Production Deploy](https://github.com/kiethk/give-me-pic/actions/workflows/deploy.yml/badge.svg)](https://github.com/kiethk/give-me-pic/actions/workflows/deploy.yml)
[![Next.js](<https://img.shields.io/badge/Frontend-Next.js%2015%20(App%20Router)-black?logo=next.js>)](https://nextjs.org/)
[![Spring Boot](https://img.shields.io/badge/Backend-Spring%20Boot%203.4%20%2F%20Java%2021-brightgreen?logo=springboot)](https://spring.io/projects/spring-boot)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20pgvector-blue?logo=postgresql)](https://github.com/pgvector/pgvector)
[![Gemini](https://img.shields.io/badge/AI%20Engine-Google%20Gemini%20API-orange?logo=google)](https://ai.google.dev/)

---

## 📌 Executive Summary & Problem Statement

Students and self-learners capture hundreds of whiteboard photos, textbook pages, and presentation slides throughout an academic semester. However, this critical visual information remains trapped in disorganized smartphone galleries—unindexed, unsearchable, and difficult to reference during revision.

**Give Me Pic** solves this challenge with an **offline-first Progressive Web App (PWA)** backed by an end-to-end Multimodal RAG architecture:

1. **Capture & Ingestion**: Upload or photograph study materials directly from mobile or desktop.
2. **Multimodal Extraction**: Transcribes handwritten text, complex diagrams, and formulas via Google Gemini Vision OCR.
3. **Semantic Indexing**: Chunks text and generates 768-dimensional dense vector embeddings stored in PostgreSQL via `pgvector`.
4. **Citation-Backed Synthesis**: Delivers an interactive AI tutor that synthesizes contextual answers with verifiable links directly referencing the original source photographs.

---

## 🚀 Key Features

### 1. Multimodal RAG & Grounded Q&A

- **Vision-Driven OCR Pipeline**: Automatically transcribes handwritten whiteboard notes, equations, and slide diagrams using the Gemini Multimodal API.
- **Vector Search with `pgvector`**: Chunks OCR outputs and computes 768-dimensional dense vector embeddings (`gemini-embedding-001`), performing cosine similarity retrieval directly in PostgreSQL.
- **Citation-Backed Answers**: Every assistant answer generates verifiable citations pointing back to the specific source photo and chunk index.
- **Course & Subject Filtering**: Search queries across all subjects or constrain context to a specific course.

### 2. Enterprise Authentication & Session Security

- **Dual-Mode Auth**: Standard credentials (BCrypt password hashing) alongside native **Google OAuth 2.0** (Google Identity Services popup).
- **Stateless JWT + Rotating HttpOnly Refresh Cookies**: 15-minute access tokens paired with rotating refresh tokens stored in PostgreSQL (`refresh_tokens`), preventing XSS and CSRF token exposure.
- **User Profile Management**: Self-service profile updates, custom avatars, and persistent storage quota tracking.

### 3. Progressive Web App (PWA) & Mobile UX

- **Installable PWA**: Standalone mobile experience with service worker caching via `@ducanh2912/next-pwa`.
- **Direct Camera Capture**: Native camera integration and multi-file picker with automatic HEIC/JPEG format normalization.
- **Resilient Upload Queue**: Background queue with auto-retry, offline detection, recovery mechanisms, and dismissible state.
- **iOS Viewport Optimization**: Minimum 16px form inputs and viewport restrictions preventing Safari auto-zoom shifts.

### 4. Modern Desktop & Adaptive Dashboard

- **Sleek Top Navigation**: High-density desktop topbar with clean typography, flush active indicator tabs, and quick-action user menu.
- **Dedicated Chat History Sidebar**: Single left sidebar in `Ask AI` view for frictionless conversation switching without layout clutter.

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
              │ PostgreSQL 16  │  │ Supabase Storage│  │ Google Gemini    │
              │  + pgvector    │  │ (S3-compatible) │  │ Multimodal API   │
              │  Flyway (V1-11)│  │ (Lecture Photos)│  │ OCR + Embeddings │
              └────────────────┘  └─────────────────┘  └──────────────────┘
```

### Module Breakdown (Spring Boot Modular Monolith)

- `com.givemepic.backend.auth`: User registration, login, JWT issuance, Google ID token verification, and refresh token rotation.
- `com.givemepic.backend.subject`: Subject lifecycle management (CRUD, color tagging, semester categorization).
- `com.givemepic.backend.media`: Multipart file upload, Supabase S3-compatible storage integration, presigned URLs, and async OCR triggers.
- `com.givemepic.backend.chat`: Vector search orchestration, Gemini RAG prompts, citation resolution, and chat session history.
- `com.givemepic.backend.common`: Global exception handling, security filters, rate limiting, and shared DTOs.

---

## 🛠️ Technology Stack

| Layer              | Technology                       | Key Capabilities                                                                                                                |
| ------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**        | Spring Boot 3.4 · Java 21        | Modular Monolith, Spring Security, Spring Data JPA, RestClient                                                                  |
| **Database**       | PostgreSQL 16 + `pgvector`       | Cosine vector similarity search (768-dim), Flyway migrations (V1–V11)                                                           |
| **Object Storage** | Supabase Storage (S3-compatible) | Secure photo storage with pre-signed URLs, bucket policies, and MIME normalization                                              |
| **AI / LLM**       | Google Gemini API                | Multimodal Vision OCR (`gemini-3.1-flash-lite`), dense embeddings (`gemini-embedding-001`, 768d), conversational RAG generation |
| **Frontend**       | Next.js 15 (React 19)            | App Router, TypeScript, Tailwind CSS, `@ducanh2912/next-pwa`                                                                    |
| **Authentication** | JWT + Google OAuth 2.0           | HttpOnly secure cookies, access token memory storage, database refresh token rotation                                           |
| **DevOps / CI-CD** | GitHub Actions                   | Automated Maven + Postgres service tests, Next.js lint/build, Vercel & Render deploy                                            |

---

## ⚡ Engineering Highlights & Technical Decisions

- **Multimodal RAG Ingestion Pipeline**: Decoupled asynchronous processing flow where photo uploads trigger background OCR with Gemini Vision, followed by semantic chunking and 768-dimensional dense vector generation stored in PostgreSQL `pgvector`.
- **Stateless Auth with Database-Backed Refresh Tokens**: Mitigated XSS and CSRF risks by combining short-lived in-memory access tokens with HttpOnly rotated refresh tokens persisted in PostgreSQL with revocation support.
- **Resilient Offline-First Upload Queue**: Implemented client-side queueing with localStorage persistence, automatic retry with backoff, and HEIC-to-JPEG normalization to ensure reliable photo submission over unstable campus networks.
- **Clean Modular Architecture**: Organized backend by business domain boundaries (`auth`, `subject`, `media`, `chat`) to prevent spaghetti dependencies while maintaining the operational simplicity of a single deployable artifact.
- **Zero-Downtime Database Migration**: Versioned database evolutions managed via 11 sequential Flyway migrations, ensuring predictable schema updates across staging and production environments.

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

- **Docker & Docker Compose** (for local PostgreSQL with `pgvector`)
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

### 2. Start Supporting Services (PostgreSQL + pgvector)

```bash
docker compose up -d
```

- PostgreSQL with `pgvector`: `localhost:5432` (db: `givemepic`, user: `givemepic`, pass: `givemepic_dev_password`)

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


