const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export interface MessageAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface Message {
  id: string;
  channelId: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  author: MessageAuthor;
  reactions: ReactionSummary[];
}

export interface CreateMessageInput {
  content: string;
  parentId?: string;
}

export interface UpdateMessageInput {
  content: string;
}

export async function getMessages(
  accessToken: string,
  workspaceId: string,
  channelId: string,
): Promise<Message[]> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages?limit=50`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to load messages: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<Message[]>;
}

export async function createMessage(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  input: CreateMessageInput,
): Promise<Message> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages`,
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
    let message = `Failed to send message: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<Message>;
}

export async function updateMessage(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
  input: UpdateMessageInput,
): Promise<Message> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
    },
  );

  if (!res.ok) {
    let message = `Failed to update message: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<Message>;
}

export async function deleteMessage(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to delete message: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
}

export async function addMessageReaction(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<ReactionSummary[]> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ emoji }),
    },
  );

  if (!res.ok) {
    let message = `Failed to add reaction: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<ReactionSummary[]>;
}

export async function removeMessageReaction(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<ReactionSummary[]> {
  const res = await fetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to remove reaction: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<ReactionSummary[]>;
}
