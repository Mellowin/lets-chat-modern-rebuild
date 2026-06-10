import { getApiBase } from "./env";

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
  attachments?: Attachment[];
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

export async function presignAttachmentUpload(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  input: { filename: string; mimeType: string; sizeBytes: number },
): Promise<PresignAttachmentResponse> {
  const res = await fetch(
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
  const res = await fetch(uploadUrl, {
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

export async function getAttachmentDownloadUrl(
  accessToken: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
  attachmentId: string,
): Promise<AttachmentDownloadUrlResponse> {
  const res = await fetch(
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
