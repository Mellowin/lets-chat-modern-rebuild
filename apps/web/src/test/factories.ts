import type { AuthUser } from "@/lib/auth-api";
import type { Channel } from "@/lib/channels-api";
import type { DirectConversation, DirectMessage } from "@/lib/direct-conversations-api";
import type { Message } from "@/lib/messages-api";
import type { Workspace } from "@/lib/workspaces-api";

export function createAuthUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    id: "u1",
    email: "a@b.com",
    username: "alice",
    displayName: null,
    avatarUrl: null,
    avatarUpdatedAt: null,
    interfaceLanguage: "en",
    role: "USER",
    createdAt: "2024-01-01T00:00:00Z",
    pushNotificationsEnabled: true,
    mentionNotificationsEnabled: true,
    directMessageNotificationsEnabled: true,
    groupMessageNotificationsEnabled: true,
    channelMessageNotificationsEnabled: true,
    ...overrides,
  };
}

export function createWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    id: "ws1",
    name: "Test Workspace",
    slug: "test",
    description: null,
    ownerId: "u1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    deletedAt: null,
    ...overrides,
  };
}

export function createChannel(overrides?: Partial<Channel>): Channel {
  return {
    id: "ch1",
    workspaceId: "ws1",
    name: "general",
    slug: "general",
    description: null,
    type: "PUBLIC",
    createdById: "u1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    deletedAt: null,
    unreadCount: 0,
    hasUnread: false,
    lastReadAt: null,
    ...overrides,
  };
}

export function createDirectConversation(overrides?: Partial<DirectConversation>): DirectConversation {
  return {
    id: "dc1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    otherParticipant: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
    lastMessage: null,
    unreadCount: 0,
    hasUnread: false,
    isOnline: false,
    ...overrides,
  };
}

export function createDirectMessage(overrides?: Partial<DirectMessage>): DirectMessage {
  return {
    id: "m1",
    conversationId: "dc1",
    content: "Hello",
    parentId: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    editedAt: null,
    author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
    parent: null,
    reactions: [],
    readByOtherParticipant: false,
    isUnreadForMe: false,
    ...overrides,
  };
}

export function createMessage(overrides?: Partial<Message>): Message {
  return {
    id: "m1",
    channelId: "ch1",
    content: "Hello",
    parentId: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    editedAt: null,
    author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
    reactions: [],
    attachments: [],
    ...overrides,
  };
}
