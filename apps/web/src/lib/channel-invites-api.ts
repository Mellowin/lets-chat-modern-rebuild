const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export type ChannelInviteRole = "MEMBER" | "ADMIN";

export interface CreateChannelInviteInput {
  email?: string;
  identifier?: string;
  role: ChannelInviteRole;
}

export interface PendingChannelInvite {
  id: string;
  role: ChannelInviteRole;
  workspace: { id: string; name: string; slug: string };
  channel: { id: string; name: string; slug: string };
  invitedBy: { id: string; username: string; displayName?: string | null };
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

export async function createChannelInvite(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  input: CreateChannelInviteInput,
): Promise<{ id: string; workspaceId: string; channelId: string; email: string; role: string; token: string; expiresAt: string; createdAt: string }> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/invites`,
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
    throw new Error(await parseErrorMessage(res, `Failed to create channel invite: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ id: string; workspaceId: string; channelId: string; email: string; role: string; token: string; expiresAt: string; createdAt: string }>;
}

export async function getPendingChannelInvites(accessToken: string): Promise<PendingChannelInvite[]> {
  const res = await fetch(`${API_BASE}/channel-invites/pending`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load channel invites: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<PendingChannelInvite[]>;
}

export async function acceptChannelInvite(
  accessToken: string,
  inviteId: string,
): Promise<{ channelId: string; workspaceId: string; role: string; joinedAt: string }> {
  const res = await fetch(`${API_BASE}/channel-invites/${encodeURIComponent(inviteId)}/accept`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to accept channel invite: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ channelId: string; workspaceId: string; role: string; joinedAt: string }>;
}

export async function declineChannelInvite(
  accessToken: string,
  inviteId: string,
): Promise<{ id: string; deletedAt: string }> {
  const res = await fetch(`${API_BASE}/channel-invites/${encodeURIComponent(inviteId)}/decline`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to decline channel invite: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ id: string; deletedAt: string }>;
}
