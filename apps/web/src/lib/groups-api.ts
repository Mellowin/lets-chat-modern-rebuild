import { getApiBase } from "./env";
import { authFetch } from "./auth-fetch";

const API_BASE = getApiBase();

export interface GroupMember {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "OWNER" | "MEMBER";
  joinedAt: string;
}

export interface GroupLastMessage {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  createdById: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  members: GroupMember[];
  myRole: "OWNER" | "MEMBER" | null;
  lastMessage: GroupLastMessage | null;
  unreadCount: number;
  hasUnread: boolean;
}

export interface GroupMessageAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface GroupMessageMention {
  userId: string;
  username: string;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: GroupMessageAuthor;
  mentions?: GroupMessageMention[];
}

export interface PaginatedGroupMessages {
  items: GroupMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface GroupMessageContextResult {
  target: GroupMessage;
  before: GroupMessage[];
  after: GroupMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

export interface CreateGroupInput {
  name: string;
  memberIds: string[];
}

export interface UpdateGroupInput {
  name: string;
}

export interface AddGroupMemberInput {
  userId: string;
}

export interface SearchUserResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
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

export async function listGroups(accessToken: string): Promise<GroupSummary[]> {
  const res = await authFetch(`${API_BASE}/groups`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load groups: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupSummary[]>;
}

export async function getGroup(accessToken: string, groupId: string): Promise<GroupSummary> {
  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load group: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupSummary>;
}

export async function createGroup(
  accessToken: string,
  input: CreateGroupInput,
): Promise<GroupSummary> {
  const res = await authFetch(`${API_BASE}/groups`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to create group: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupSummary>;
}

export async function updateGroup(
  accessToken: string,
  groupId: string,
  input: UpdateGroupInput,
): Promise<GroupSummary> {
  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}`, {
    method: "PATCH",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to update group: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupSummary>;
}

export async function archiveGroup(accessToken: string, groupId: string): Promise<{ success: true }> {
  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to archive group: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ success: true }>;
}

export async function addGroupMember(
  accessToken: string,
  groupId: string,
  input: AddGroupMemberInput,
): Promise<GroupSummary> {
  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/members`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to add member: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupSummary>;
}

export async function removeGroupMember(
  accessToken: string,
  groupId: string,
  userId: string,
): Promise<GroupSummary> {
  const res = await authFetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to remove member: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupSummary>;
}

export async function leaveGroup(accessToken: string, groupId: string): Promise<{ success: true }> {
  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/leave`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to leave group: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ success: true }>;
}

export async function listGroupMessages(
  accessToken: string,
  groupId: string,
  options?: { cursor?: string; limit?: number },
): Promise<PaginatedGroupMessages> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 50));
  if (options?.cursor) params.set("cursor", options.cursor);

  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/messages?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load messages: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<PaginatedGroupMessages>;
}

export async function getGroupMessageContext(
  accessToken: string,
  groupId: string,
  messageId: string,
  options?: { before?: number; after?: number },
): Promise<GroupMessageContextResult> {
  const params = new URLSearchParams();
  if (options?.before !== undefined) params.set("before", String(options.before));
  if (options?.after !== undefined) params.set("after", String(options.after));
  const query = params.toString();
  const res = await authFetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/context${query ? `?${query}` : ""}`,
    {
      method: "GET",
      headers: authHeaders(accessToken),
    },
  );

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load message context: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupMessageContextResult>;
}

export async function sendGroupMessage(
  accessToken: string,
  groupId: string,
  content: string,
): Promise<GroupMessage> {
  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/messages`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to send message: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupMessage>;
}

export async function markGroupRead(
  accessToken: string,
  groupId: string,
): Promise<{ success: true; lastReadAt: string }> {
  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/read`, {
    method: "POST",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to mark as read: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<{ success: true; lastReadAt: string }>;
}

export async function searchUsers(accessToken: string, query: string): Promise<SearchUserResult[]> {
  const params = new URLSearchParams({ q: query });
  const res = await authFetch(`${API_BASE}/users/search?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to search users: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<SearchUserResult[]>;
}
