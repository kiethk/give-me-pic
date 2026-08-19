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

export async function register(payload: Required<AuthPayload>) {
  return request<AuthResponse>("/api/auth/register", payload);
}

export async function login(payload: Omit<AuthPayload, "displayName">) {
  return request<AuthResponse>("/api/auth/login", payload);
}

export type UserProfile = {
  userId: string;
  email: string;
  displayName: string;
};

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

export async function logout() {
  await fetch(`${apiUrl}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

async function request<T>(path: string, body: AuthPayload): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message ?? "Không thể kết nối với máy chủ.");
  }

  return data as T;
}