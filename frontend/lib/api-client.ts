function getApiUrl() {
    if (process.env.NEXT_PUBLIC_API_URL) {
        return process.env.NEXT_PUBLIC_API_URL;
    }
    if (typeof window !== "undefined") {
        return `${window.location.protocol}//${window.location.hostname}:8080`;
    }
    return "http://localhost:8080";
}


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

export type UserProfile = {
    userId: string;
    email: string;
    displayName: string;
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

export async function askChat(payload: { question: string; sessionId?: string | null; subjectId?: string | null }) {
    return request<ChatAnswer>("/api/chat", {
        method: "POST",
        body: payload,
    });
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

export async function getProfile() {
    const response = await fetch(`${getApiUrl()}/api/auth/me`, {
        credentials: "include",
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(data?.message ?? "Phiên đăng nhập không hợp lệ.");
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

export async function archiveSubject(subjectId: string) {
    return request<void>(`/api/subjects/${subjectId}`, {
        method: "DELETE",
    });
}

// Helper to ensure media URLs are absolute based on the current environment
function ensureAbsoluteUrl(url: string) {
    if (!url || url.startsWith("http")) return url;
    return `${getApiUrl()}${url.startsWith("/") ? "" : "/"}${url}`;
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
    const formData = new FormData();
    formData.append("file", file);

    const params = new URLSearchParams();
    params.append("subjectId", subjectId);
    if (caption) params.append("caption", caption);
    if (clientUploadId) params.append("clientUploadId", clientUploadId);

    const response = await fetch(`${getApiUrl()}/api/media/upload?${params.toString()}`, {
        method: "POST",
        credentials: "include",
        body: formData,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(data?.message ?? "Không thể upload file.");
    }

    const item = data as MediaItem;
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
    await fetch(`${getApiUrl()}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
    });
}

async function request<T>(
    path: string,
    options: {
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

        body?: Record<string, unknown>;
    },
): Promise<T> {
    const response = await fetch(`${getApiUrl()}${path}`, {
        method: options.method,
        headers: options.body ? { "Content-Type": "application/json" } : undefined,
        credentials: "include",
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(data?.message ?? "Không thể kết nối với máy chủ.");
    }

    return data as T;
}
