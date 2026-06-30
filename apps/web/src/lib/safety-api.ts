import { getApiBase } from "./env";
import { authFetch } from "./auth-fetch";

const API_BASE = getApiBase();

export interface BlockedUser {
  id: string;
  blockedUserId: string;
  reason: string | null;
  createdAt: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface BlockUserInput {
  userId: string;
  reason?: string;
}

export interface ReportInput {
  reportedUserId: string;
  reason: string;
  details?: string;
  messageId?: string;
  directConversationId?: string;
  groupId?: string;
}

async function parseErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
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

function authHeaders(accessToken: string) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function listBlockedUsers(
  accessToken: string,
): Promise<BlockedUser[]> {
  const res = await authFetch(`${API_BASE}/blocks`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to load blocked users: ${res.status} ${res.statusText}`),
    );
  }

  return res.json() as Promise<BlockedUser[]>;
}

export async function blockUser(
  accessToken: string,
  input: BlockUserInput,
): Promise<BlockedUser> {
  const res = await authFetch(`${API_BASE}/blocks`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to block user: ${res.status} ${res.statusText}`),
    );
  }

  return res.json() as Promise<BlockedUser>;
}

export async function unblockUser(
  accessToken: string,
  blockedUserId: string,
): Promise<{ success: boolean }> {
  const res = await authFetch(
    `${API_BASE}/blocks/${encodeURIComponent(blockedUserId)}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    },
  );

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to unblock user: ${res.status} ${res.statusText}`),
    );
  }

  return res.json() as Promise<{ success: boolean }>;
}

export async function submitReport(
  accessToken: string,
  input: ReportInput,
): Promise<{ success: boolean }> {
  const res = await authFetch(`${API_BASE}/reports`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `Failed to submit report: ${res.status} ${res.statusText}`),
    );
  }

  return res.json() as Promise<{ success: boolean }>;
}
