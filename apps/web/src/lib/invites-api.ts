import { getApiBase } from "./env";
import { fetchWithTimeout } from "./fetch-timeout";

const API_BASE = getApiBase();

export interface PendingInvite {
  id: string;
  workspace: { id: string; name: string; slug: string };
  invitedBy: { id: string; username: string; displayName: string | null };
  role: "ADMIN" | "MEMBER";
  expiresAt: string;
  createdAt: string;
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  email: string | null;
  role: "ADMIN" | "MEMBER";
  status: "PENDING" | "USED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  usedAt: string | null;
  deletedAt: string | null;
  maxUses: number | null;
  usesCount: number;
  createdAt: string;
}

export interface InvitePreview {
  workspaceName: string | null;
  expiresAt: string;
  valid: boolean;
}

export interface AcceptInviteResult {
  workspaceId: string;
  role: string;
  joinedAt: string | null;
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  let message = fallback;
  try {
    const body = await res.json();
    if (Array.isArray(body?.message) && body.message.length > 0) {
      message = body.message.join("; ");
    } else if (body?.message) {
      message = body.message;
    } else if (body?.error) {
      message = body.error;
    }
  } catch {
    // ignore
  }
  return message;
}

export async function createWorkspaceInvite(
  accessToken: string,
  workspaceId: string,
  input: { email?: string; identifier?: string; role: "ADMIN" | "MEMBER"; maxUses?: number },
): Promise<{ id: string; workspaceId: string; email: string | null; role: string; token: string; expiresAt: string; maxUses: number | null; createdAt: string }> {
  const res = await fetchWithTimeout(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/invites`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to create invite: ${res.status} ${res.statusText}`));
  }

  return res.json();
}

export async function listWorkspaceInvites(
  accessToken: string,
  workspaceId: string,
): Promise<WorkspaceInvite[]> {
  const res = await fetchWithTimeout(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/invites`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load invites: ${res.status} ${res.statusText}`));
  }

  return res.json();
}

export async function revokeWorkspaceInvite(
  accessToken: string,
  workspaceId: string,
  inviteId: string,
): Promise<{ id: string; deletedAt: string }> {
  const res = await fetchWithTimeout(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(inviteId)}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to revoke invite: ${res.status} ${res.statusText}`));
  }

  return res.json();
}

export async function previewInvite(token: string): Promise<InvitePreview> {
  const res = await fetchWithTimeout(
    `${API_BASE}/invites/${encodeURIComponent(token)}/preview`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load invite preview: ${res.status} ${res.statusText}`));
  }

  return res.json();
}

export async function getPendingInvites(accessToken: string): Promise<PendingInvite[]> {
  const res = await fetchWithTimeout(`${API_BASE}/invites/pending`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load invites: ${res.status} ${res.statusText}`));
  }

  return res.json();
}

export async function acceptInvite(
  accessToken: string,
  inviteId: string,
): Promise<AcceptInviteResult> {
  const res = await fetchWithTimeout(`${API_BASE}/invites/${encodeURIComponent(inviteId)}/accept`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to accept invite: ${res.status} ${res.statusText}`));
  }

  return res.json();
}

export async function acceptInviteByToken(
  accessToken: string,
  token: string,
): Promise<AcceptInviteResult> {
  const res = await fetchWithTimeout(`${API_BASE}/invites/accept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to accept invite: ${res.status} ${res.statusText}`));
  }

  return res.json();
}

export async function declineInvite(
  accessToken: string,
  inviteId: string,
): Promise<{ id: string; deletedAt: string }> {
  const res = await fetchWithTimeout(`${API_BASE}/invites/${encodeURIComponent(inviteId)}/decline`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to decline invite: ${res.status} ${res.statusText}`));
  }

  return res.json();
}
