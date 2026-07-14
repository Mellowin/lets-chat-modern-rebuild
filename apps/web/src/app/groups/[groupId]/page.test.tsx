import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import GroupConversationPage from "./page";
import {
  getGroup,
  listGroupMessages,
  pinGroupMessage,
  unpinGroupMessage,
  getPinnedGroupMessages,
  type GroupSummary,
  type GroupMessage,
} from "@/lib/groups-api";

const socketHandlers: Record<string, (...args: unknown[]) => void> = {};
const socketOnMock = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
  socketHandlers[event] = handler;
});
const socketEmitMock = vi.fn();
const socketDisconnectMock = vi.fn();
const socketOffMock = vi.fn();

const routerPushMock = vi.fn();
const mockRouter = { push: routerPushMock };

vi.mock("next/navigation", () => ({
  useParams: () => ({ groupId: "g1" }),
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: "u1", email: "a@b.com", username: "alice" },
    accessToken: "token",
  }),
}));

vi.mock("@/lib/groups-api", () => ({
  getGroup: vi.fn(),
  listGroupMessages: vi.fn(),
  sendGroupMessage: vi.fn(),
  markGroupRead: vi.fn(() => Promise.resolve({ success: true, lastReadAt: "2024-01-01T00:00:00Z" })),
  pinGroupMessage: vi.fn(),
  unpinGroupMessage: vi.fn(),
  getPinnedGroupMessages: vi.fn(() => Promise.resolve({ items: [], nextCursor: null, hasMore: false })),
  getGroupMessageContext: vi.fn(),
  uploadGroupAttachmentViaProxyWithProgress: vi.fn(),
  getGroupAttachmentFileObjectUrl: vi.fn(),
  fetchGroupAttachmentFile: vi.fn(),
}));

vi.mock("@/lib/socket-client", () => ({
  createSocket: vi.fn(() => ({
    on: socketOnMock,
    emit: socketEmitMock,
    disconnect: socketDisconnectMock,
    off: socketOffMock,
  })),
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.setItem("accessToken", "token");
});

afterEach(() => {
  vi.clearAllMocks();
  Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
});

function mockGroupAndMessages(
  messagesData: GroupMessage[] = [],
  role: "OWNER" | "MEMBER" = "OWNER",
) {
  vi.mocked(getGroup).mockResolvedValueOnce({
    id: "g1",
    name: "Test Group",
    createdById: "u1",
    archivedAt: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    memberCount: 2,
    members: [
      { id: "u1", username: "alice", displayName: "Alice", avatarUrl: null, role: "OWNER", joinedAt: "2024-01-01T00:00:00Z" },
      { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null, role: "MEMBER", joinedAt: "2024-01-01T00:00:00Z" },
    ],
    myRole: role,
    lastMessage: null,
    unreadCount: 0,
    hasUnread: false,
  } as GroupSummary);
  vi.mocked(listGroupMessages).mockResolvedValueOnce({
    items: messagesData,
    nextCursor: null,
    hasMore: false,
  });
}

const baseMessage: GroupMessage = {
  id: "m1",
  groupId: "g1",
  content: "Hello group",
  replyToMessageId: null,
  replyTo: null,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
  mentions: [],
  attachments: [],
  isPinned: false,
  pin: null,
};

describe("GroupConversationPage — pinned messages", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
    window.alert = vi.fn();
  });

  it("owner sees Pin action and pins a message", async () => {
    mockGroupAndMessages([baseMessage]);
    vi.mocked(pinGroupMessage).mockResolvedValueOnce({
      id: "pin1",
      pinnedAt: new Date().toISOString(),
      pinnedBy: { id: "u1", username: "alice", displayName: "Alice" },
      message: {
        id: "m1",
        content: "Hello group",
        createdAt: baseMessage.createdAt,
        author: baseMessage.author,
        attachmentCount: 0,
        replyTo: null,
      },
    });

    render(<GroupConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello group")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("group-message-menu-trigger-m1"));
    expect(screen.getByTestId("group-pin-action-m1")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("group-pin-action-m1"));

    await waitFor(() => {
      expect(pinGroupMessage).toHaveBeenCalledWith("token", "g1", "m1");
    });
    expect(screen.getByTestId("message-pinned-indicator-m1")).toBeInTheDocument();
    expect(screen.getByTestId("group-pinned-header")).toBeInTheDocument();
  });

  it("owner sees Unpin action for pinned message", async () => {
    const pinnedMessage: GroupMessage = { ...baseMessage, isPinned: true };
    mockGroupAndMessages([pinnedMessage]);
    vi.mocked(unpinGroupMessage).mockResolvedValueOnce(undefined);

    render(<GroupConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello group")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("group-message-menu-trigger-m1"));
    expect(screen.getByTestId("group-unpin-action-m1")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("group-unpin-action-m1"));

    await waitFor(() => {
      expect(unpinGroupMessage).toHaveBeenCalledWith("token", "g1", "m1");
    });
    expect(screen.queryByTestId("message-pinned-indicator-m1")).not.toBeInTheDocument();
  });

  it("non-owner does not see pin/unpin actions", async () => {
    mockGroupAndMessages([baseMessage], "MEMBER");

    render(<GroupConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello group")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("group-message-menu-trigger-m1"));
    expect(screen.queryByTestId("group-pin-action-m1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("group-unpin-action-m1")).not.toBeInTheDocument();
  });

  it("pinned header renders and panel toggles", async () => {
    const pinnedMessage: GroupMessage = { ...baseMessage, isPinned: true };
    mockGroupAndMessages([pinnedMessage]);
    vi.mocked(getPinnedGroupMessages).mockResolvedValueOnce({
      items: [
        {
          id: "pin1",
          pinnedAt: new Date().toISOString(),
          pinnedBy: { id: "u1", username: "alice", displayName: "Alice" },
          message: {
            id: "m1",
            content: "Hello group",
            createdAt: pinnedMessage.createdAt,
            author: pinnedMessage.author,
            attachmentCount: 0,
            replyTo: null,
          },
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    render(<GroupConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("group-pinned-header")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("group-pins-toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("group-pins-panel")).toBeInTheDocument();
    });
    expect(screen.getByTestId("group-pinned-item-m1")).toBeInTheDocument();
  });

  it("websocket group:message:pinned updates indicator", async () => {
    mockGroupAndMessages([baseMessage]);

    render(<GroupConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello group")).toBeInTheDocument();
    });

    expect(socketHandlers["group:message:pinned"]).toBeDefined();
    act(() => {
      socketHandlers["group:message:pinned"]({
        messageId: "m1",
        groupId: "g1",
        pinnedAt: new Date().toISOString(),
        pinnedByUserId: "u1",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("message-pinned-indicator-m1")).toBeInTheDocument();
    });
  });

  it("websocket group:message:unpinned removes indicator", async () => {
    const pinnedMessage: GroupMessage = { ...baseMessage, isPinned: true };
    mockGroupAndMessages([pinnedMessage]);

    render(<GroupConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("message-pinned-indicator-m1")).toBeInTheDocument();
    });

    expect(socketHandlers["group:message:unpinned"]).toBeDefined();
    act(() => {
      socketHandlers["group:message:unpinned"]({ messageId: "m1", groupId: "g1" });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("message-pinned-indicator-m1")).not.toBeInTheDocument();
    });
  });
});
