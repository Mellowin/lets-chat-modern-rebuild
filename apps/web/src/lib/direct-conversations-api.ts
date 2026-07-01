import { getApiBase } from "./env";
import { authFetch } from "./auth-fetch";

const API_BASE = getApiBase();

export interface DirectConversationOtherParticipant {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface DirectConversationLastMessage {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
}

export interface DirectConversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  otherParticipant: DirectConversationOtherParticipant | null;
  lastMessage: DirectConversationLastMessage | null;
  unreadCount: number;
  hasUnread?: boolean;
  isOnline: boolean;
}

export interface CreateDirectConversationInput {
  userId?: string;
  usernameOrEmail?: string;
}

export interface DirectMessageAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface DirectMessageParentPreview {
  id: string;
  content: string;
  author: DirectMessageAuthor;
}

export interface DirectMessageReactionSummary {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface DirectMessageMention {
  userId: string;
  username: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  author: DirectMessageAuthor;
  parent: DirectMessageParentPreview | null;
  reactions: DirectMessageReactionSummary[];
  readByOtherParticipant: boolean;
  isUnreadForMe: boolean;
  mentions?: DirectMessageMention[];
}

export interface PaginatedDirectMessages {
  items: DirectMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SendDirectMessageInput {
  content: string;
  parentId?: string;
}

export interface UpdateDirectMessageInput {
  content: string;
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

export async function listDirectConversations(accessToken: string): Promise<DirectConversation[]> {
  const res = await authFetch(`${API_BASE}/direct-conversations`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load conversations: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<DirectConversation[]>;
}

export async function createDirectConversation(
  accessToken: string,
  input: CreateDirectConversationInput,
): Promise<DirectConversation> {
  const res = await authFetch(`${API_BASE}/direct-conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to start conversation: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<DirectConversation>;
}

export async function listDirectMessages(
  accessToken: string,
  conversationId: string,
  options?: { cursor?: string; limit?: number },
): Promise<PaginatedDirectMessages> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 50));
  if (options?.cursor) params.set("cursor", options.cursor);

  const res = await authFetch(
    `${API_BASE}/direct-conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load messages: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<PaginatedDirectMessages>;
}

export async function sendDirectMessage(
  accessToken: string,
  conversationId: string,
  input: SendDirectMessageInput,
): Promise<DirectMessage> {
  const res = await authFetch(
    `${API_BASE}/direct-conversations/${encodeURIComponent(conversationId)}/messages`,
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
    throw new Error(await parseErrorMessage(res, `Failed to send message: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<DirectMessage>;
}

export async function markDirectConversationRead(
  accessToken: string,
  conversationId: string,
): Promise<{ success: boolean; lastReadAt: string }> {
  const res = await authFetch(
    `${API_BASE}/direct-conversations/${encodeURIComponent(conversationId)}/read`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to mark as read: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ success: boolean; lastReadAt: string }>;
}

export async function reactToDirectMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
  emoji: string,
): Promise<DirectMessageReactionSummary[]> {
  const res = await authFetch(
    `${API_BASE}/direct-conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions`,
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
    throw new Error(await parseErrorMessage(res, `Failed to add reaction: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<DirectMessageReactionSummary[]>;
}

export async function updateDirectMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
  input: UpdateDirectMessageInput,
): Promise<DirectMessage> {
  const res = await authFetch(
    `${API_BASE}/direct-conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
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
    throw new Error(await parseErrorMessage(res, `Failed to edit message: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<DirectMessage>;
}

export async function removeDirectMessageReaction(
  accessToken: string,
  conversationId: string,
  messageId: string,
  emoji: string,
): Promise<DirectMessageReactionSummary[]> {
  const res = await authFetch(
    `${API_BASE}/direct-conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to remove reaction: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<DirectMessageReactionSummary[]>;
}

export async function deleteDirectMessage(
  accessToken: string,
  conversationId: string,
  messageId: string,
): Promise<{ ok: true }> {
  const res = await authFetch(
    `${API_BASE}/direct-conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to delete message: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ ok: true }>;
}
