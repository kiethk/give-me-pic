---
title: Chat typewriter buffer queue and flat assistant layout with collapsible photo sources
author: Kiethk
date: 2026-11-23
branch: main
id: l-aa0b0e03
scope: repo
status: active
src: agent
touches:
  - backend/pom.xml
  - backend/src/main/java/com/givemepic/backend/chat/controller/ChatController.java
  - backend/src/main/java/com/givemepic/backend/chat/service/ChatService.java
  - backend/src/main/java/com/givemepic/backend/common/config/SecurityConfig.java
  - backend/src/main/java/com/givemepic/backend/common/security/JwtAuthFilter.java
  - backend/src/main/java/com/givemepic/backend/media/service/GeminiLlmProvider.java
  - backend/src/main/java/com/givemepic/backend/media/service/LlmProvider.java
  - frontend/app/dashboard/chat/page.tsx
  - frontend/lib/api-client.ts
  - frontend/public/sw.js
---

## Decided
- Implemented character typewriter buffer queue (16ms loop popping adaptive 1-4 chars) in `frontend/app/dashboard/chat/page.tsx` instead of directly dumping raw SSE chunks, giving a fluid word-by-word streaming effect identical to Gemini/ChatGPT.
- Replaced assistant message white card container with flat, borderless typography directly on the canvas background.
- Replaced cumbersome inline citation tags with a single dropdown button `Source` with chevron arrow, expanding to a horizontal row of square photo thumbnail cards (`h-20 w-20 rounded-xl`).
- Added `X-Accel-Buffering: no` in backend `ChatController.java` to prevent reverse-proxy buffering.

## Tried and ruled out
- Directly appending raw SSE delta tokens to state: caused bursts of text where 20-50 characters dropped onto the screen all at once, creating a jerky reading experience.
- Enclosing assistant answers inside bordered cards: looked cluttered and outdated compared to modern conversational interfaces.
