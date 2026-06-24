import { getApiBase } from "./env";
import { authFetch } from "./auth-fetch";
import type { GroupSummary } from "./groups-api";

const API_BASE = getApiBase();

export interface GroupInviteLink {
  id: string;
  groupId: string;
  token: string;
  expiresAt: string;
  maxUses: number | null;
  createdAt: string;
}

export interface GroupInviteListItem {
  id: string;
  groupId: string;
  expiresAt: string | null;
  revokedAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdAt: string;
  valid: boolean;
}

export interface GroupInvitePreview {
  groupName: string | null;
  expiresAt: string;
  valid: boolean;
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

function authHeaders(accessToken: string) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function createGroupInvite(
  accessToken: string,
  groupId: string,
): Promise<GroupInviteLink> {
  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/invites`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to create invite link: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupInviteLink>;
}

export async function listGroupInvites(
  accessToken: string,
  groupId: string,
): Promise<GroupInviteListItem[]> {
  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/invites`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load invite links: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupInviteListItem[]>;
}

export async function revokeGroupInvite(
  accessToken: string,
  groupId: string,
  inviteId: string,
): Promise<{ id: string; revokedAt: string }> {
  const res = await authFetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/invites/${encodeURIComponent(inviteId)}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to revoke invite link: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ id: string; revokedAt: string }>;
}

export async function previewGroupInvite(token: string): Promise<GroupInvitePreview> {
  const res = await fetch(`${API_BASE}/group-invites/${encodeURIComponent(token)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load invite: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupInvitePreview>;
}

export async function acceptGroupInvite(
  accessToken: string,
  token: string,
): Promise<GroupSummary> {
  const res = await authFetch(
    `${API_BASE}/group-invites/${encodeURIComponent(token)}/accept`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to accept invite: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupSummary>;
}
