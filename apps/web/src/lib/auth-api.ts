import { getApiBase } from "./env";
import { fetchWithTimeout, ApiTimeoutError, isApiTimeoutError } from "./fetch-timeout";

const API_BASE = getApiBase();

export { ApiTimeoutError, isApiTimeoutError };

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarUpdatedAt: string | null;
  interfaceLanguage: "en" | "uk" | "ru";
  createdAt: string;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

export interface RegisterPendingResult {
  requiresEmailVerification: true;
  email: string;
}

export interface VerifyEmailInput {
  token: string;
}

export interface ResendVerificationInput {
  email: string;
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  let message = fallback;
  try {
    const body = await res.json();
    if (body?.message) message = body.message;
    else if (body?.error) message = body.error;
  } catch {
    // ignore parse error
  }
  return message;
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Login failed: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<AuthResult>;
}

export async function register(input: RegisterInput): Promise<RegisterPendingResult> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Registration failed: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<RegisterPendingResult>;
}

export async function getMe(accessToken: string): Promise<AuthUser> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/me`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load user: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<AuthUser>;
}

export async function logout(refreshToken: string): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Logout failed: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ success: boolean }>;
}

export async function updateDisplayName(accessToken: string, displayName: string): Promise<AuthUser> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ displayName }),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to update display name: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<AuthUser>;
}

export async function uploadAvatar(accessToken: string, file: File): Promise<AuthUser> {
  const formData = new FormData();
  formData.append("avatar", file);

  const res = await fetchWithTimeout(`${API_BASE}/auth/me/avatar/upload`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to upload avatar: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<AuthUser>;
}

export async function verifyEmail(input: VerifyEmailInput): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Email verification failed: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ success: boolean }>;
}

export async function resendVerification(input: ResendVerificationInput): Promise<{ message: string }> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Resend failed: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ message: string }>;
}

export interface ForgotPasswordInput {
  email: string;
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<{ message: string }> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Request failed: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ message: string }>;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export async function resetPassword(input: ResetPasswordInput): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Reset failed: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ success: boolean }>;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export async function changePassword(accessToken: string, input: ChangePasswordInput): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Change password failed: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ success: boolean }>;
}

export interface RequestEmailChangeInput {
  newEmail: string;
}

export async function requestEmailChange(accessToken: string, input: RequestEmailChangeInput): Promise<{ message: string }> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/change-email/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Request failed: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ message: string }>;
}

export interface ConfirmEmailChangeInput {
  token: string;
}

export interface SessionResponse {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  isActive: boolean;
}

export async function confirmEmailChange(input: ConfirmEmailChangeInput): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/change-email/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Confirmation failed: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ success: boolean }>;
}

export async function listSessions(accessToken: string): Promise<SessionResponse[]> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/sessions`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load sessions: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<SessionResponse[]>;
}

export async function revokeAllSessions(accessToken: string): Promise<{ success: boolean; revokedCount: number }> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/sessions/revoke-all`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to revoke sessions: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ success: boolean; revokedCount: number }>;
}

export async function revokeSession(accessToken: string, sessionId: string): Promise<{ success: boolean }> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to revoke session: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ success: boolean }>;
}

export async function updateInterfaceLanguage(accessToken: string, interfaceLanguage: "en" | "uk" | "ru"): Promise<AuthUser> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/me/interface-language`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ interfaceLanguage }),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to update interface language: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<AuthUser>;
}
