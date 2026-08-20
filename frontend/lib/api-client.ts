const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

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
  createdAt: string;
};

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
  const response = await fetch(`${apiUrl}/api/auth/me`, {
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

export async function getMedia(subjectId: string) {
  return request<MediaItem[]>(`/api/media?subjectId=${encodeURIComponent(subjectId)}`, {
    method: "GET",
  });
}

export async function uploadMedia(subjectId: string, file: File, caption?: string) {
  const formData = new FormData();
  formData.append("subjectId", subjectId);
  formData.append("file", file);
  if (caption) {
    formData.append("caption", caption);
  }

  const response = await fetch(`${apiUrl}/api/media/upload`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message ?? "Không thể upload file.");
  }

  return data as MediaItem;
}

export async function deleteMedia(mediaId: string) {
  return request<void>(`/api/media/${mediaId}`, {
    method: "DELETE",
  });
}

export async function logout() {
  await fetch(`${apiUrl}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

async function request<T>(path: string, options: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
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