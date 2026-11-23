# Chat Streaming via Server-Sent Events (SSE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real-time token streaming for AI chat answers using Server-Sent Events (SSE), delivering immediate citations, sub-second TTFT, a blinking cursor indicator (`▍`), and an abortable "Dừng tạo" button.

**Architecture:** A dedicated Spring Boot endpoint (`POST /api/chat/stream`) leverages Gemini's `:streamGenerateContent?alt=sse` to push chunks via `SseEmitter`. Citations and session metadata are emitted upfront in an initial `metadata` event, tokens arrive in `delta` events, and the complete response is persisted to PostgreSQL upon the `done` event. Next.js consumes the stream via browser `fetch` and `ReadableStream`.

**Tech Stack:** Java 21, Spring Boot 3.4, Spring Web `SseEmitter`, Google Gemini API (streamGenerateContent SSE), Next.js 15 App Router, TypeScript, React 19.

**Spec:** [docs/superpowers/specs/2026-11-23-chat-streaming-sse-design.md](file:///d:/Workspace/give-me-pic/docs/superpowers/specs/2026-11-23-chat-streaming-sse-design.md)

## Global Constraints
- `POST /api/chat` remains 100% backward-compatible and unchanged for tests/scripts.
- Streaming uses standard HTTP/HTTPS Server-Sent Events (`MediaType.TEXT_EVENT_STREAM_VALUE`).
- Database consistency: `chat_messages` and `message_citations` must store complete records upon stream termination.
- Security: `POST /api/chat/stream` requires `@AuthenticationPrincipal UUID userId` via existing JWT security filter.
- Code style: Follow established naming conventions in `.agents/rules/spring-boot-module-structure.md`.

## Review Focus
- **Early Client Disconnect / Abort**: If the user clicks "Dừng tạo" or closes the browser mid-stream, Spring Boot must catch client disconnect cleanly and avoid dangling threads or resource leaks.
- **Empty / Irrelevant Chunks**: If `similarity_search` finds no relevant chunks, `metadata` event sends empty `citations: []` and Gemini proceeds with general fallback without throwing errors.
- **Gemini API 429 During Stream**: If rate limited at initial stream connection, an `event: error` must be pushed to client with a user-friendly message.
- **Stream Auto-Scroll**: Frontend auto-scroll must track new tokens smoothly without hijacking user manual scroll if they scrolled up to read earlier history.
- **Session Auto-Title Creation**: New sessions must still receive an auto-generated title after the stream finishes, identical to non-streaming behavior.

---

### Task 1: Gemini Streaming Provider

**Files:**
- Modify: `backend/src/main/java/com/givemepic/backend/media/service/LlmProvider.java`
- Modify: `backend/src/main/java/com/givemepic/backend/media/service/GeminiLlmProvider.java`
- Test: `backend/src/test/java/com/givemepic/backend/media/service/GeminiLlmProviderStreamingTests.java`

**Interfaces:**
- Consumes: Gemini REST API endpoint `POST /models/{model}:streamGenerateContent?alt=sse&key={apiKey}`
- Produces: `void streamAnswer(String prompt, Consumer<String> onChunk, Runnable onComplete, Consumer<Throwable> onError)` in `LlmProvider`

- [ ] **Step 1: Write the failing test for `streamAnswer`**
  Create `GeminiLlmProviderStreamingTests.java` using a mock HTTP server / RestClient to verify that SSE lines `data: {"candidates":[{"content":{"parts":[{"text":"chunk1"}]}}]}` are parsed and dispatched to `onChunk`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cd backend && ./mvnw test -Dtest=GeminiLlmProviderStreamingTests`
  Expected: FAIL with "method streamAnswer does not exist"

- [ ] **Step 3: Add `streamAnswer` to `LlmProvider` interface and implement in `GeminiLlmProvider`**
  Use `RestClient.post().uri("/models/{model}:streamGenerateContent?alt=sse").exchange(...)` to read response line-by-line using a `BufferedReader`, extract JSON parts, and invoke callbacks.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cd backend && ./mvnw test -Dtest=GeminiLlmProviderStreamingTests`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add backend/src/main/java/com/givemepic/backend/media/service/ backend/src/test/java/com/givemepic/backend/media/service/
  git commit -m "feat(ai): add streamAnswer to GeminiLlmProvider using Gemini SSE API"
  ```

---

### Task 2: Backend Streaming Chat Service & Controller Endpoint

**Files:**
- Modify: `backend/src/main/java/com/givemepic/backend/chat/service/ChatService.java`
- Modify: `backend/src/main/java/com/givemepic/backend/chat/controller/ChatController.java`
- Test: `backend/src/test/java/com/givemepic/backend/chat/controller/ChatStreamingControllerTests.java`

**Interfaces:**
- Consumes: `LlmProvider.streamAnswer(...)`, `ChatRequest(sessionId, subjectId, question)`
- Produces: `POST /api/chat/stream` returning `SseEmitter` with `metadata`, `delta`, `done`, and `error` events

- [ ] **Step 1: Write integration test for `POST /api/chat/stream`**
  Verify that endpoint produces `text/event-stream`, emits `event: metadata` containing `citations` and `sessionId`, streams `delta` chunks, and finally emits `event: done`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cd backend && ./mvnw test -Dtest=ChatStreamingControllerTests`
  Expected: FAIL with 404 Not Found on `/api/chat/stream`

- [ ] **Step 3: Implement `streamAnswer` in `ChatService` and map endpoint in `ChatController`**
  1. `ChatController`:
     ```java
     @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
     public SseEmitter streamChat(@AuthenticationPrincipal UUID userId, @RequestBody ChatRequest request)
     ```
  2. `ChatService`:
     - Creates `SseEmitter(180_000L)`.
     - Executes similarity search, writes user message to `chat_messages`.
     - Sends `SseEmitter.event().name("metadata").data(...)`.
     - Calls `llmProvider.streamAnswer`: emits `name("delta")` for each token, accumulates full string in `StringBuilder`.
     - On completion: Writes assistant message to `chat_messages` and `message_citations`, triggers session title generation if new session, sends `name("done")`, calls `emitter.complete()`.
     - On error/timeout: Catches exception, sends `name("error")`, calls `emitter.completeWithError(t)`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cd backend && ./mvnw test -Dtest=ChatStreamingControllerTests`
  Expected: PASS

- [ ] **Step 5: Commit**
  ```bash
  git add backend/src/main/java/com/givemepic/backend/chat/ backend/src/test/java/com/givemepic/backend/chat/
  git commit -m "feat(chat): implement POST /api/chat/stream endpoint with SseEmitter"
  ```

---

### Task 3: Frontend API Client Streaming Support

**Files:**
- Modify: `frontend/lib/api-client.ts`

**Interfaces:**
- Consumes: `POST /api/chat/stream` with JWT credentials
- Produces:
  ```typescript
  export interface StreamChatCallbacks {
      onMetadata?: (data: { sessionId: string; messageId: string; citations: ChatCitation[] }) => void;
      onDelta?: (deltaText: string) => void;
      onDone?: (fullText: string) => void;
      onError?: (error: Error) => void;
  }
  export async function askChatStream(payload: ChatRequestPayload, callbacks: StreamChatCallbacks, signal?: AbortSignal): Promise<void>
  ```

- [ ] **Step 1: Implement `askChatStream` in `frontend/lib/api-client.ts`**
  - Use `fetch(`${API_BASE_URL}/api/chat/stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal })`.
  - Parse SSE lines (`event: ...`, `data: ...`) from `response.body.getReader()`.
  - Dispatch parsed payloads to `callbacks.onMetadata`, `callbacks.onDelta`, `callbacks.onDone`, and `callbacks.onError`.

- [ ] **Step 2: Run frontend build and type check**
  Run: `cd frontend && npm run lint && npm run build`
  Expected: PASS with 0 TypeScript/ESLint errors

- [ ] **Step 3: Commit**
  ```bash
  git add frontend/lib/api-client.ts
  git commit -m "feat(frontend): add askChatStream client for SSE consumption"
  ```

---

### Task 4: Frontend Chat UI Integration (Blinking Cursor & Stop Generating)

**Files:**
- Modify: `frontend/app/dashboard/chat/page.tsx`

**Interfaces:**
- Consumes: `askChatStream` from `frontend/lib/api-client.ts`
- Produces: Interactive chat UI with live streaming tokens, animated cursor `▍`, instant citations display, and an AbortController "Dừng tạo" button.

- [ ] **Step 1: Wire `askChatStream` and streaming state into `handleSend`**
  - Add state `isStreaming` and ref `abortControllerRef`.
  - On send: immediately display user message, create a placeholder assistant message with `content: ""` and an empty citations array.
  - On `metadata`: populate assistant message's citations and update current `sessionId`.
  - On `delta`: append token text to the assistant message and trigger smooth auto-scroll.
  - While `isStreaming`: render a blinking cursor `▍` at the end of the streaming assistant message.
  - Next to the send button: show a red/outline "Dừng tạo" (Square icon) button when `isStreaming` is true; clicking calls `abortControllerRef.current?.abort()`.
  - On `done` / `error`: set `isStreaming = false`, cleanup abort controller.

- [ ] **Step 2: Verify with Next.js build & lint**
  Run: `cd frontend && npm run lint && npm run build`
  Expected: PASS in ~4-5s with 0 errors.

- [ ] **Step 3: End-to-End Visual Verification**
  - Run local dev server, submit test prompt on `/dashboard/chat`, verify:
    1. Instant appearance of citations card.
    2. Real-time typing animation with blinking cursor.
    3. Auto-scroll tracking.
    4. "Dừng tạo" button functionality.

- [ ] **Step 4: Commit**
  ```bash
  git add frontend/app/dashboard/chat/page.tsx
  git commit -m "feat(ui): integrate real-time SSE streaming with blinking cursor and stop button"
  ```
