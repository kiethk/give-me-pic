// API calls use relative paths — Next.js rewrites proxy them to the backend.
// This ensures Vercel cookies (auth) are properly set and sent.


type AuthPayload = {
    email: string;
    password: string;
    displayName?: string;
};

export type AuthResponse = {
    accessToken: string;
    refreshToken: string;
    userId: string;
    email: string;
    displayName: string;
};

export interface UserProfile {
    userId: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
    subscriptionTier: string;
};

export type Subject = {
    id: string;
    name: string;
    description: string | null;
    colorHex: string;
    semester: string | null;
    archived: boolean;
    createdAt: string;
    updatedAt: string;
};

export type CreateSubjectInput = {
    name: string;
    description?: string;
    colorHex?: string;
    semester?: string;
};

export type MediaItem = {
    id: string;
    subjectId: string;
    fileName: string;
    contentType: string | null;
    sizeBytes: number;
    caption: string | null;
    url: string;
    ocrStatus: string;
    ocrError: string | null;
    embeddingStatus: string;
    embeddingError: string | null;
    createdAt: string;
};

export type ChatCitation = {
    chunkId: string;
    mediaId: string;
    fileName: string;
    imageUrl: string;
    similarityScore: number;
};

export type ChatSession = {
    sessionId: string;
    subjectId: string | null;
    title: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ChatHistoryMessage = {
    messageId: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
    citations: ChatCitation[];
};

export type ChatAnswer = {
    sessionId: string;
    messageId: string;
    answer: string;
    citations: ChatCitation[];
};

export type ChatRequestPayload = {
    question: string;
    sessionId?: string | null;
    subjectId?: string | null;
};

export interface StreamChatCallbacks {
    onMetadata?: (data: { sessionId: string; messageId: string; citations: ChatCitation[] }) => void;
    onDelta?: (deltaText: string) => void;
    onDone?: (fullText: string) => void;
    onError?: (error: Error) => void;
}

export async function askChat(payload: ChatRequestPayload) {
    return request<ChatAnswer>("/api/chat", {
        method: "POST",
        body: payload,
    });
}

export async function askChatStream(
    payload: ChatRequestPayload,
    callbacks: StreamChatCallbacks,
    signal?: AbortSignal,
): Promise<void> {
    const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        },
        credentials: "include",
        body: JSON.stringify(payload),
        signal,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const err = new Error(errorData?.message ?? `Server error (${response.status})`);
        callbacks.onError?.(err);
        throw err;
    }

    if (!response.body) {
        const err = new Error("No data received from server.");
        callbacks.onError?.(err);
        throw err;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let currentData = "";

    const dispatch = (event: string, data: string) => {
        if (!data) return;
        try {
            const parsed = JSON.parse(data);
            if (event === "metadata" || (!event && parsed.sessionId && parsed.citations)) {
                callbacks.onMetadata?.({
                    sessionId: parsed.sessionId,
                    messageId: parsed.messageId,
                    citations: (parsed.citations ?? []).map((c: ChatCitation) => ({
                        ...c,
                        imageUrl: ensureAbsoluteUrl(c.imageUrl),
                    })),
                });
            } else if (event === "delta" || (!event && typeof parsed.text === "string")) {
                callbacks.onDelta?.(parsed.text ?? "");
            } else if (event === "done" || (!event && typeof parsed.fullContent === "string")) {
                callbacks.onDone?.(parsed.fullContent ?? "");
            } else if (event === "error" || (!event && parsed.message && !parsed.sessionId)) {
                const err = new Error(parsed.message ?? "An error occurred during processing.");
                callbacks.onError?.(err);
            }
        } catch {
            if (event === "delta") {
                callbacks.onDelta?.(data);
            }
        }
    };

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (line.startsWith("event:")) {
                    currentEvent = (line.startsWith("event: ") ? line.slice(7) : line.slice(6)).trim();
                } else if (line.startsWith("data:")) {
                    const dataContent = line.startsWith("data: ") ? line.slice(6) : line.slice(5);
                    currentData = currentData ? currentData + "\n" + dataContent : dataContent;
                } else if (line.trim() === "") {
                    if (currentEvent || currentData) {
                        dispatch(currentEvent, currentData);
                        currentEvent = "";
                        currentData = "";
                    }
                }
            }
        }

        if (buffer.trim()) {
            const lines = buffer.split(/\r?\n/);
            for (const line of lines) {
                if (line.startsWith("event:")) {
                    currentEvent = (line.startsWith("event: ") ? line.slice(7) : line.slice(6)).trim();
                } else if (line.startsWith("data:")) {
                    const dataContent = line.startsWith("data: ") ? line.slice(6) : line.slice(5);
                    currentData = currentData ? currentData + "\n" + dataContent : dataContent;
                }
            }
            if (currentEvent || currentData) {
                dispatch(currentEvent, currentData);
            }
        }
    } catch (err: unknown) {
        if (signal?.aborted || (err as { name?: string })?.name === "AbortError") {
            return;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        callbacks.onError?.(error);
        throw error;
    } finally {
        reader.releaseLock();
    }
}

export async function getChatSessions() {
    return request<ChatSession[]>("/api/chat/sessions", {
        method: "GET",
    });
}

export async function getChatSessionMessages(sessionId: string) {
    return request<ChatHistoryMessage[]>(`/api/chat/sessions/${sessionId}/messages`, {
        method: "GET",
    });
}

export async function renameChatSession(sessionId: string, title: string) {
    return request<void>(`/api/chat/sessions/${sessionId}`, {
        method: "PATCH",
        body: { title },
    });
}

export async function register(payload: Required<AuthPayload>) {
    return request<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: payload,
    });
}

export async function login(payload: Omit<AuthPayload, "displayName">) {
    return request<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: payload,
    });
}

export async function loginWithGoogle(idToken: string) {
    return request<AuthResponse>("/api/auth/google", {
        method: "POST",
        body: { idToken },
    });
}

export async function getProfile() {
    const response = await fetch(`/api/auth/me`, {
        credentials: "include",
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(data?.message ?? "Invalid session.");
    }

    return data as UserProfile;
}

export async function updateProfile(payload: { displayName: string; avatarUrl?: string }) {
    return request<UserProfile>("/api/auth/me", {
        method: "PATCH",
        body: payload,
    });
}

export async function uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`/api/auth/avatar`, {
        method: "POST",
        credentials: "include",
        body: formData,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(data?.message ?? "Could not upload image.");
    }

    return data as UserProfile;
}

export async function getSubjects() {
    return request<Subject[]>("/api/subjects", {
        method: "GET",
    });
}

export async function createSubject(payload: CreateSubjectInput) {
    return request<Subject>("/api/subjects", {
        method: "POST",
        body: payload,
    });
}

export type UpdateSubjectInput = {
    name: string;
    description?: string;
    colorHex?: string;
    semester?: string;
    archived?: boolean;
};

export async function updateSubject(id: string, payload: UpdateSubjectInput) {
    return request<Subject>(`/api/subjects/${id}`, {
        method: "PUT",
        body: payload,
    });
}

export async function deleteSubject(subjectId: string) {
    return request<void>(`/api/subjects/${subjectId}`, {
        method: "DELETE",
    });
}

export interface SuggestSubjectResponse {
    matchedSubjectId: string | null;
    suggestedName: string | null;
    isNew: boolean;
}

export async function suggestSubject(file: File): Promise<SuggestSubjectResponse> {
    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch(`/api/subjects/suggest`, {
            method: "POST",
            credentials: "include",
            body: formData,
        });

        if (!response.ok) {
            return { matchedSubjectId: null, suggestedName: null, isNew: false };
        }

        return await response.json();
    } catch {
        return { matchedSubjectId: null, suggestedName: null, isNew: false };
    }
}

export const archiveSubject = deleteSubject;

// Media URLs from MinIO are already absolute (presigned URLs).
// This is a passthrough — kept for safety in case relative URLs ever appear.
function ensureAbsoluteUrl(url: string) {
    if (!url || url.startsWith("http")) return url;
    // Fallback: make relative URL absolute using current window origin
    if (typeof window !== "undefined") {
        return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
    }
    return url;
}

export async function getMedia(subjectId?: string) {
    const query = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
    const response = await request<MediaItem[]>(`/api/media${query}`, {
        method: "GET",
    });
    return response.map(m => ({
        ...m,
        url: ensureAbsoluteUrl(m.url)
    }));
}

export async function uploadMedia(
    subjectId: string,
    file: File,
    caption?: string,
    clientUploadId?: string,
) {
    // 1. Get presigned URL
    const presignedParams = new URLSearchParams({
        subjectId,
        fileName: file.name,
        contentType: file.type || "application/octet-stream"
    });
    
    const presignedResponse = await request<{url: string, objectKey: string}>(`/api/media/presigned-url?${presignedParams.toString()}`, {
        method: "GET"
    });
    
    // 2. Upload directly to S3 (bypass Vercel)
    const s3Response = await fetch(presignedResponse.url, {
        method: "PUT",
        headers: {
            "Content-Type": file.type || "application/octet-stream"
        },
        body: file
    });
    
    if (!s3Response.ok) {
        throw new Error("Could not upload image to storage server.");
    }
    
    // 3. Confirm upload with backend
    const confirmParams = new URLSearchParams({
        subjectId,
        objectKey: presignedResponse.objectKey,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size.toString()
    });
    
    if (caption) confirmParams.append("caption", caption);
    if (clientUploadId) confirmParams.append("clientUploadId", clientUploadId);

    const data = await request<MediaItem>(`/api/media/confirm-upload?${confirmParams.toString()}`, {
        method: "POST"
    });

    const item = data;
    item.url = ensureAbsoluteUrl(item.url);
    return item;
}

export async function deleteMedia(mediaId: string) {
    return request<void>(`/api/media/${mediaId}`, {
        method: "DELETE",
    });
}

export async function retryProcessing(mediaId: string) {
    return request<void>(`/api/media/${mediaId}/retry`, {
        method: "POST",
    });
}

export async function logout() {
    await fetch(`/api/auth/logout`, {
        method: "POST",
        credentials: "include",
    });
}

async function request<T>(
    path: string,
    options: {
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

        body?: unknown;
    },
): Promise<T> {
    const response = await fetch(`${path}`, {
        method: options.method,
        headers: options.body ? { "Content-Type": "application/json" } : undefined,
        credentials: "include",
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error(data?.message || "Unauthorized: Session expired or invalid.");
        }
        throw new Error(data?.message || `Request failed with status ${response.status}`);
    }

    return data as T;
}
