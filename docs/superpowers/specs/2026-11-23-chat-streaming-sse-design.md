# Design Specification: Real-time Chat Streaming via Server-Sent Events (SSE)

**Date**: 2026-11-23  
**Status**: Proposed (Awaiting Approval)  
**Author**: Solution Architect & Full-Stack Team  
**Scope**: Backend (`com.givemepic.backend.chat`), AI Layer (`GeminiLlmProvider`), Frontend (`frontend/app/dashboard/chat`)

---

## 1. Intent & Problem Statement
Currently, `/api/chat` blocks for 3 to 6 seconds while Gemini generates the full response before returning a JSON payload. This high initial time-to-first-token (TTFT) creates a perceived sluggishness.

**Goal**: Deliver a responsive, ChatGPT/Claude-like real-time conversational experience by streaming tokens as they are generated, while preserving exact source citations and persisting conversation history to PostgreSQL.

---

## 2. Goals & Non-Goals

### Goals
- **Sub-second TTFT**: First token rendered within < 800ms.
- **Instant Citations**: Source citations delivered immediately at stream onset so students see referenced lecture slides upfront.
- **Graceful Control**: Provide a "Stop generating" (AbortController) button and smooth auto-scrolling with a blinking cursor indicator (`▍`).
- **Resilience & Backward Compatibility**: Keep the existing `POST /api/chat` intact for non-streaming clients/scripts.
- **Database Consistency**: Persist the complete user and assistant messages in PostgreSQL `chat_messages` and `message_citations` without partial corruption.

### Non-Goals
- Full bi-directional WebSocket connection (unnecessary protocol overhead and reconnection complexity for unidirectional LLM token streaming).
- Audio streaming / Voice conversation.

---

## 3. Evaluated Approaches & Tradeoffs

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| **Approach 1: Server-Sent Events (SSE) via `POST /api/chat/stream`** | Native browser HTTP/HTTPS support, zero protocol upgrade overhead, works through existing JWT auth cookie/header, automatic proxy traversal. | Unidirectional (Server $\to$ Client only). | **Selected (Recommended)** |
| **Approach 2: WebSocket Connection (`ws://` / `wss://`)** | Bi-directional messaging. | Heavy handshake overhead, stateful socket management in Spring Boot, proxy/CDN issues on Vercel/Render. | Ruled out |
| **Approach 3: Polling / Long Polling** | Simple. | Inefficient, high latency, waste of server resources. | Ruled out |

---

## 4. SSE Wire Protocol Design

Endpoint: `POST /api/chat/stream`  
Content-Type: `text/event-stream`

### Event Types:
1. **`event: metadata`** (Sent immediately after vector similarity search):
   ```json
   {
     "sessionId": "b0a68d84-...",
     "messageId": "c1f79e21-...",
     "citations": [
       {
         "chunkId": "...",
         "mediaId": "...",
         "fileName": "lecture_01.jpg",
         "imageUrl": "/api/media/.../image",
         "similarityScore": 0.89
       }
     ]
   }
   ```
2. **`event: delta`** (Sent repeatedly as tokens arrive from Gemini):
   ```json
   {
     "text": "B-Tree "
   }
   ```
3. **`event: done`** (Sent once generation is finished and database save is complete):
   ```json
   {
     "fullContent": "..."
   }
   ```
4. **`event: error`** (Sent if an unrecoverable exception occurs):
   ```json
   {
     "message": "Không thể hoàn thành câu trả lời do quá tải API."
   }
   ```

---

## 5. Component Implementation Details

### A. Backend (`backend/`)
1. **`GeminiLlmProvider`**:
   - Add `streamAnswer(String prompt, Consumer<String> onTokenChunk, Runnable onComplete, Consumer<Throwable> onError)`.
   - Call Gemini endpoint `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={apiKey}`.
   - Parse SSE chunks (`data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}`).
2. **`ChatService`**:
   - `answerStream(UUID userId, ChatRequest request, SseEmitter emitter)`:
     1. Resolve or create `chat_sessions`.
     2. Run similarity search with `pgvector` and filter relevance threshold.
     3. Save `user` message to `chat_messages`.
     4. Send `metadata` event with citations and session ID.
     5. Accumulate assistant response text while streaming each chunk via `delta` event.
     6. On completion: Save `assistant` message to `chat_messages`, insert citations to `message_citations`, auto-generate title if new session, and send `done` event.
3. **`ChatController`**:
   - Endpoint: `@PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)`.

### B. Frontend (`frontend/`)
1. **`lib/api-client.ts`**:
   - Add `askChatStream(payload, { onMetadata, onDelta, onDone, onError, signal })` using standard browser `fetch` + `ReadableStreamDefaultReader`.
2. **`frontend/app/dashboard/chat/page.tsx`**:
   - Add state: `isStreaming: boolean`, `abortControllerRef`.
   - On submit: Add user message, show assistant message with blinking cursor `▍` and instant citation cards.
   - Append incoming tokens smoothly.
   - Add "Dừng tạo" (Stop generating) button next to input bar when `isStreaming` is active.

---

## 6. Verification Plan
1. **Backend Integration Test**:
   - Unit test with mock streaming response.
   - Verify `POST /api/chat/stream` emits valid SSE events in proper sequence.
2. **Frontend E2E Verification**:
   - Submit prompt in browser subagent, verify instant citations display, stream rendering, and "Stop" button interruption.
   - Check that `chat_messages` table retains full conversation history.
