const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  type: "PUBLIC" | "PRIVATE";
  createdById: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateChannelInput {
  name: string;
  description?: string;
  type?: "PUBLIC" | "PRIVATE";
}

export interface ChannelMember {
  id: string;
  channelId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
  user: { id: string; username: string };
}

export interface AddChannelMemberInput {
  identifier: string;
  role?: "MEMBER" | "ADMIN";
}

export async function getChannels(
  accessToken: string,
  workspaceId: string,
): Promise<Channel[]> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to load channels: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<Channel[]>;
}

export async function getArchivedChannels(
  accessToken: string,
  workspaceId: string,
): Promise<Channel[]> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/archived`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to load archived channels: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<Channel[]>;
}

export async function getChannel(
  accessToken: string,
  workspaceId: string,
  channelId: string,
): Promise<Channel> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to load channel: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<Channel>;
}

export async function getChannelMembers(
  accessToken: string,
  workspaceId: string,
  channelId: string,
): Promise<ChannelMember[]> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/members`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to load channel members: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<ChannelMember[]>;
}

export async function removeChannelMember(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  memberId: string,
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to remove channel member: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<{ success: boolean }>;
}

export async function addChannelMember(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  input: AddChannelMemberInput,
): Promise<ChannelMember> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/members`,
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
    let message = `Failed to add channel member: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<ChannelMember>;
}

export async function restoreChannel(
  accessToken: string,
  workspaceId: string,
  channelId: string,
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/restore`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to restore channel: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<{ success: boolean }>;
}

export async function archiveChannel(
  accessToken: string,
  workspaceId: string,
  channelId: string,
): Promise<{ success: boolean }> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/archive`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to archive channel: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<{ success: boolean }>;
}

export async function createChannel(
  accessToken: string,
  workspaceId: string,
  input: CreateChannelInput,
): Promise<Channel> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels`,
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
    let message = `Failed to create channel: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<Channel>;
}
