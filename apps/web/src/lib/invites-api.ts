import { getApiBase } from "./env";

const API_BASE = getApiBase();

export interface PendingInvite {
  id: string;
  workspace: { id: string; name: string; slug: string };
  invitedBy: { id: string; username: string; displayName: string | null };
  role: "ADMIN" | "MEMBER";
  expiresAt: string;
  createdAt: string;
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
  input: { email?: string; identifier?: string; role: "ADMIN" | "MEMBER" },
): Promise<{ id: string; workspaceId: string; email: string; role: string; token: string; expiresAt: string; createdAt: string }> {
  const res = await fetch(
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

  return res.json() as Promise<{ id: string; workspaceId: string; email: string; role: string; token: string; expiresAt: string; createdAt: string }>;
}

export async function getPendingInvites(accessToken: string): Promise<PendingInvite[]> {
  const res = await fetch(`${API_BASE}/invites/pending`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load invites: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<PendingInvite[]>;
}

export async function acceptInvite(
  accessToken: string,
  inviteId: string,
): Promise<{ workspaceId: string; role: string; joinedAt: string }> {
  const res = await fetch(`${API_BASE}/invites/${encodeURIComponent(inviteId)}/accept`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to accept invite: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ workspaceId: string; role: string; joinedAt: string }>;
}

export async function declineInvite(
  accessToken: string,
  inviteId: string,
): Promise<{ id: string; deletedAt: string }> {
  const res = await fetch(`${API_BASE}/invites/${encodeURIComponent(inviteId)}/decline`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to decline invite: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ id: string; deletedAt: string }>;
}
