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

export interface GroupMessageAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "file";
  createdAt: string;
  url?: string;
  thumbnailUrl?: string;
}

export interface ForwardedFromResponse {
  sourceType: "channel" | "direct" | "group";
  sourceMessageId: string;
  sourceChatId: string;
  originalAuthorId?: string;
  originalAuthorName?: string;
  originalCreatedAt: string;
  replySnapshot?: { id: string; content: string; authorName: string };
  isAnonymous?: false;
}

export interface ForwardedFromAnonymous {
  sourceType: "channel" | "direct" | "group";
  originalCreatedAt: string;
  isAnonymous: true;
}

export type ForwardedFrom = ForwardedFromResponse | ForwardedFromAnonymous;

export interface GroupMessage {
  id: string;
  groupId: string;
  content: string;
  replyToMessageId: string | null;
  replyTo: {
    id: string;
    content: string | null;
    author: GroupMessageAuthor | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  author: GroupMessageAuthor;
  mentions?: GroupMessageMention[];
  attachments?: GroupMessageAttachment[];
  forwardedFrom?: ForwardedFrom;
  isPinned?: boolean;
  pin?: {
    pinnedAt: string;
    pinnedByUserId?: string | null;
  } | null;
}

export interface PinnedGroupMessageSummary {
  id: string;
  pinnedAt: string;
  pinnedBy: {
    id: string;
    username: string;
    displayName: string | null;
  } | null;
  message: {
    id: string;
    content: string | null;
    createdAt: string;
    author: GroupMessageAuthor;
    attachmentCount: number;
    replyTo: {
      id: string;
      content: string | null;
      author: GroupMessageAuthor | null;
    } | null;
    forwardedFrom?: ForwardedFrom;
  };
}

export interface PaginatedPinnedGroupMessages {
  items: PinnedGroupMessageSummary[];
  nextCursor: string | null;
  hasMore: boolean;
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
  contactPrivacySetting?: "EVERYONE" | "REQUESTS_ONLY" | "NOBODY";
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

export interface CreateGroupMessageInput {
  content?: string;
  replyToMessageId?: string;
  attachmentIds?: string[];
}

export async function sendGroupMessage(
  accessToken: string,
  groupId: string,
  input: CreateGroupMessageInput,
): Promise<GroupMessage> {
  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/messages`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to send message: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<GroupMessage>;
}

export interface UploadGroupAttachmentViaProxyResponse {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "file";
  createdAt: string;
}

export function uploadGroupAttachmentViaProxyWithProgress(
  accessToken: string,
  groupId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadGroupAttachmentViaProxyResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data as UploadGroupAttachmentViaProxyResponse);
        } catch {
          reject(new Error("Upload failed: invalid server response"));
        }
      } else {
        let message = `Upload failed: ${xhr.status} ${xhr.statusText}`;
        try {
          const data = JSON.parse(xhr.responseText);
          if (data?.message) message = data.message;
        } catch {
          // keep default message
        }
        reject(new Error(message));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed: network error"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload failed: aborted"));
    });

    xhr.open(
      "POST",
      `${API_BASE}/groups/${encodeURIComponent(groupId)}/messages/attachments/upload`,
    );
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.send(formData);
  });
}

export async function fetchGroupAttachmentFile(
  accessToken: string,
  groupId: string,
  messageId: string,
  attachmentId: string,
): Promise<Blob> {
  const url = `${API_BASE}/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/file`;

  const res = await authFetch(
    url,
    {
      method: "GET",
      headers: {
        Accept: "*/*",
        Authorization: `Bearer ${accessToken}`,
      },
    },
    { timeoutMs: 60_000 },
  );

  if (!res.ok) {
    let message = `Failed to download file: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.blob();
}

export async function getGroupAttachmentFileObjectUrl(
  accessToken: string,
  groupId: string,
  messageId: string,
  attachmentId: string,
): Promise<string> {
  const blob = await fetchGroupAttachmentFile(
    accessToken,
    groupId,
    messageId,
    attachmentId,
  );
  return URL.createObjectURL(blob);
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

export async function pinGroupMessage(
  accessToken: string,
  groupId: string,
  messageId: string,
): Promise<PinnedGroupMessageSummary> {
  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/pin`, {
    method: "POST",
    headers: {
      ...authHeaders(accessToken),
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to pin message: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<PinnedGroupMessageSummary>;
}

export async function unpinGroupMessage(
  accessToken: string,
  groupId: string,
  messageId: string,
): Promise<void> {
  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/pin`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to unpin message: ${res.status} ${res.statusText}`));
  }
}

export async function getPinnedGroupMessages(
  accessToken: string,
  groupId: string,
  options?: { limit?: number; cursor?: string },
): Promise<PaginatedPinnedGroupMessages> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 20));
  if (options?.cursor) params.set("cursor", options.cursor);

  const res = await authFetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/pins?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, `Failed to load pinned messages: ${res.status} ${res.statusText}`));
  }

  return res.json() as Promise<PaginatedPinnedGroupMessages>;
}
