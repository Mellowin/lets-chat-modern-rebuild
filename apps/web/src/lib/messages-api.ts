import { getApiBase } from "./env";
import { authFetch } from "./auth-fetch";

const API_BASE = getApiBase();

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

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "file";
  createdAt: string;
}

export interface MessageMention {
  userId: string;
  username: string;
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

export interface Message {
  id: string;
  channelId: string;
  content: string;
  parentId: string | null;
  replyToMessageId: string | null;
  replyTo: {
    id: string;
    content: string | null;
    author: MessageAuthor | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  author: MessageAuthor;
  reactions: ReactionSummary[];
  attachments?: Attachment[];
  mentions?: MessageMention[];
  forwardedFrom?: ForwardedFrom;
  isPinned?: boolean;
  pin?: {
    pinnedAt: string;
    pinnedByUserId?: string | null;
  } | null;
}

export interface PinnedMessageSummary {
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
    author: MessageAuthor;
    attachmentCount: number;
    replyTo: {
      id: string;
      content: string | null;
      author: MessageAuthor | null;
    } | null;
    forwardedFrom?: ForwardedFrom;
  };
}

export interface PaginatedPinnedMessages {
  items: PinnedMessageSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CreateMessageAttachmentInput {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "file";
}

export interface CreateMessageInput {
  content?: string;
  parentId?: string;
  replyToMessageId?: string;
  attachments?: CreateMessageAttachmentInput[];
}

export interface PresignAttachmentResponse {
  uploadUrl: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "file";
  expiresInSeconds: number;
}

export interface AttachmentDownloadUrlResponse {
  downloadUrl: string;
  expiresInSeconds: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "file";
  createdAt: string;
}

export interface UploadAttachmentViaProxyResponse {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: "image" | "file";
}

export interface UpdateMessageInput {
  content: string;
}

export async function getMessages(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  options?: { cursor?: string; limit?: number },
): Promise<PaginatedMessages> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 50));
  if (options?.cursor) params.set("cursor", options.cursor);

  const res = await authFetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages?${params.toString()}`,
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

  return res.json() as Promise<PaginatedMessages>;
}

export async function presignAttachmentUpload(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  input: { filename: string; mimeType: string; sizeBytes: number },
): Promise<PresignAttachmentResponse> {
  const res = await authFetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/attachments/presign`,
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
    let message = `Failed to presign upload: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<PresignAttachmentResponse>;
}

export async function uploadAttachmentToPresignedUrl(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const res = await authFetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }
}

export function uploadAttachmentToPresignedUrlWithProgress(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed: network error"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload failed: aborted"));
    });

    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

export function uploadAttachmentViaProxyWithProgress(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadAttachmentViaProxyResponse> {
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
          resolve(data as UploadAttachmentViaProxyResponse);
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
      `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/attachments/upload`,
    );
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.send(formData);
  });
}

export async function getAttachmentDownloadUrl(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
  attachmentId: string,
): Promise<AttachmentDownloadUrlResponse> {
  const res = await authFetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/download-url`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to get download URL: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<AttachmentDownloadUrlResponse>;
}

export async function fetchAttachmentFile(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
  attachmentId: string,
): Promise<Blob> {
  const url = `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/file`;

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

export async function getAttachmentFileObjectUrl(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
  attachmentId: string,
): Promise<string> {
  const blob = await fetchAttachmentFile(
    accessToken,
    workspaceId,
    channelId,
    messageId,
    attachmentId,
  );
  return URL.createObjectURL(blob);
}

export async function createMessage(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  input: CreateMessageInput,
): Promise<Message> {
  const res = await authFetch(
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
  const res = await authFetch(
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
  const res = await authFetch(
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
  const res = await authFetch(
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
  const res = await authFetch(
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

export interface PaginatedMessages {
  items: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SearchChannelMessagesResult {
  items: Message[];
  nextCursor: string | null;
}

export interface MessageContextResult {
  target: Message;
  before: Message[];
  after: Message[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

export async function getMessageContext(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
  options?: { before?: number; after?: number },
): Promise<MessageContextResult> {
  const params = new URLSearchParams();
  if (options?.before !== undefined) params.set("before", String(options.before));
  if (options?.after !== undefined) params.set("after", String(options.after));

  const query = params.toString();
  const url = `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/context${query ? `?${query}` : ""}`;

  const res = await authFetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    let message = `Failed to load message context: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<MessageContextResult>;
}

export async function searchChannelMessages(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  q: string,
  options?: { limit?: number; cursor?: string },
): Promise<SearchChannelMessagesResult> {
  const params = new URLSearchParams();
  params.set("q", q.trim());
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.cursor) params.set("cursor", options.cursor);

  const res = await authFetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/search?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Search failed: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<SearchChannelMessagesResult>;
}

export interface WorkspaceSearchResult {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  channel: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface GlobalSearchChannelSource {
  type: "CHANNEL";
  workspaceId: string;
  workspaceName: string;
  channelId: string;
  channelName: string;
  channelSlug: string;
  channelType: "PUBLIC" | "PRIVATE";
}

export interface GlobalSearchDirectSource {
  type: "DIRECT";
  conversationId: string;
  otherParticipant: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
}

export interface GlobalSearchGroupSource {
  type: "GROUP";
  groupId: string;
  groupName: string;
}

export type GlobalSearchSource =
  | GlobalSearchChannelSource
  | GlobalSearchDirectSource
  | GlobalSearchGroupSource;

export interface GlobalSearchResult {
  id: string;
  content: string;
  contentSnippet: string;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  source: GlobalSearchSource;
}

export interface GlobalSearchResponse {
  items: GlobalSearchResult[];
  nextCursor: string | null;
}

export async function searchWorkspaceMessages(
  accessToken: string,
  workspaceId: string,
  q: string,
  options?: { limit?: number; channelId?: string },
): Promise<WorkspaceSearchResult[]> {
  const params = new URLSearchParams();
  params.set("q", q.trim());
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.channelId) params.set("channelId", options.channelId);

  const res = await authFetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/search/messages?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Search failed: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<WorkspaceSearchResult[]>;
}

export interface SearchGlobalMessagesOptions {
  limit?: number;
  cursor?: string;
  scope?: "all" | "channel" | "direct" | "group";
  workspaceId?: string;
  channelId?: string;
  conversationId?: string;
  groupId?: string;
}

export async function searchGlobalMessages(
  accessToken: string,
  q: string,
  options?: SearchGlobalMessagesOptions,
): Promise<GlobalSearchResponse> {
  const params = new URLSearchParams();
  params.set("q", q.trim());
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.cursor) params.set("cursor", options.cursor);
  if (options?.scope) params.set("scope", options.scope);
  if (options?.workspaceId) params.set("workspaceId", options.workspaceId);
  if (options?.channelId) params.set("channelId", options.channelId);
  if (options?.conversationId) params.set("conversationId", options.conversationId);
  if (options?.groupId) params.set("groupId", options.groupId);

  const res = await authFetch(`${API_BASE}/search/messages?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    let message = `Search failed: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<GlobalSearchResponse>;
}

export async function pinMessage(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
): Promise<PinnedMessageSummary> {
  const res = await authFetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/pin`,
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
    let message = `Failed to pin message: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<PinnedMessageSummary>;
}

export async function unpinMessage(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  const res = await authFetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/pin`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to unpin message: ${res.status} ${res.statusText}`;
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

export async function getPinnedMessages(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  options?: { limit?: number; cursor?: string },
): Promise<PaginatedPinnedMessages> {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? 20));
  if (options?.cursor) params.set("cursor", options.cursor);

  const res = await authFetch(
    `${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/pins?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!res.ok) {
    let message = `Failed to load pinned messages: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
      else if (body?.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json() as Promise<PaginatedPinnedMessages>;
}
