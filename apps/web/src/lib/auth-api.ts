const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarUpdatedAt: string | null;
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
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Login failed: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<AuthResult>;
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Registration failed: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<AuthResult>;
}

export async function getMe(accessToken: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/auth/me`, {
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
  const res = await fetch(`${API_BASE}/auth/logout`, {
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
  const res = await fetch(`${API_BASE}/auth/me`, {
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

  const res = await fetch(`${API_BASE}/auth/me/avatar/upload`, {
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
