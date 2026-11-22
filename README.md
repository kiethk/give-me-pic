# Give Me Pic 📸

> AI-powered study tool — snap your lecture photos, ask questions, get cited answers.

[![CI](https://github.com/kiethk/give-me-pic/actions/workflows/ci.yml/badge.svg)](https://github.com/kiethk/give-me-pic/actions/workflows/ci.yml)
[![Deploy](https://github.com/kiethk/give-me-pic/actions/workflows/deploy.yml/badge.svg)](https://github.com/kiethk/give-me-pic/actions/workflows/deploy.yml)

## Stack

| Layer | Tech |
|-------|------|
| Backend | Spring Boot 4.1 · Java 21 · PostgreSQL + pgvector |
| Frontend | Next.js 15 · TypeScript · Tailwind CSS · PWA |
| AI | Gemini API — OCR + embeddings + chat |
| Object Storage | Render (prod) / MinIO (local) |
| Hosting | Render (BE) · Vercel (FE) |

## CI/CD

| Trigger | Workflow | What it does |
|---------|----------|--------------|
| Any push / PR | `ci.yml` | Maven build + JUnit tests (Postgres service) · ESLint + Next.js build |
| Push to `main` | `deploy.yml` | Trigger Render deploy hook · `vercel --prod` |
| PR opened/updated | `pr-check.yml` | Enforce Conventional Commit title |

## Local development

```bash
# Start Postgres + MinIO
docker compose up -d

# Backend
cd backend && ./mvnw spring-boot:run

# Frontend
cd frontend && npm install && npm run dev
```

## Required GitHub Secrets

| Secret | Where to get it |
|--------|----------------|
| `RENDER_DEPLOY_HOOK_URL` | Render dashboard → Service → Settings → Deploy Hook |
| `VERCEL_TOKEN` | vercel.com → Account Settings → Tokens |
| `VERCEL_ORG_ID` | `vercel env ls` or `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` after `vercel link` |
| `GEMINI_API_KEY` | aistudio.google.com |
| `NEXT_PUBLIC_API_URL` | Your Render service URL |
