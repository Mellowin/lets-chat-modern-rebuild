import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Sidebar from "./Sidebar";
import { useAuth } from "@/lib/auth-context";
import { listDirectConversations } from "@/lib/direct-conversations-api";

const socketHandlers: Record<string, (...args: unknown[]) => void> = {};
const socketOffHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
const socketOnMock = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
  socketHandlers[event] = handler;
  if (!socketOffHandlers[event]) socketOffHandlers[event] = [];
  socketOffHandlers[event].push(handler);
});
const socketOffMock = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
  if (socketOffHandlers[event]) {
    socketOffHandlers[event] = socketOffHandlers[event].filter((h) => h !== handler);
  }
  if (socketHandlers[event] === handler) {
    delete socketHandlers[event];
  }
});
const socketDisconnectMock = vi.fn();

function makeMockSocket() {
  return {
    on: socketOnMock,
    off: socketOffMock,
    disconnect: socketDisconnectMock,
  };
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/workspaces-api", () => ({
  getWorkspaces: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/channels-api", () => ({
  getChannels: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/direct-conversations-api", () => ({
  listDirectConversations: vi.fn(),
}));

vi.mock("@/lib/socket-client", () => ({
  createSocket: vi.fn(() => makeMockSocket()),
}));

function mockAuth(userOverrides?: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
    accessToken: "token",
    refreshToken: "rt",
    isLoading: false,
    isAuthenticated: true,
    loginSuccess: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
    ...userOverrides,
  } as ReturnType<typeof useAuth>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  Object.keys(socketOffHandlers).forEach((k) => delete socketOffHandlers[k]);
});

describe("Sidebar — direct unread badge", () => {
  it("shows total unread badge from direct conversations", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        lastMessage: { id: "dm1", content: "Hey", createdAt: "2024-01-01T00:00:00Z", authorId: "u2" },
        unreadCount: 3,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: null, avatarUrl: null },
        lastMessage: { id: "dm2", content: "Hi", createdAt: "2024-01-01T00:00:00Z", authorId: "u3" },
        unreadCount: 2,
      },
    ]);

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });

  it("reloads conversations on direct:conversation:updated socket event", async () => {
    mockAuth();
    vi.mocked(listDirectConversations)
      .mockResolvedValueOnce([
        {
          id: "dc1",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          otherParticipant: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
          lastMessage: { id: "dm1", content: "Hey", createdAt: "2024-01-01T00:00:00Z", authorId: "u2" },
          unreadCount: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "dc1",
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
          otherParticipant: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
          lastMessage: { id: "dm2", content: "New msg", createdAt: "2024-01-02T00:00:00Z", authorId: "u2" },
          unreadCount: 2,
        },
      ]);

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    handler({
      id: "dm2",
      conversationId: "dc1",
      content: "New msg",
      parentId: null,
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
      parent: null,
    });

    await waitFor(() => {
      expect(listDirectConversations).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("cleans up socket listener on unmount", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([]);

    const { unmount } = render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText("Direct messages")).toBeInTheDocument();
    });

    unmount();

    expect(socketOffMock).toHaveBeenCalledWith(
      "direct:conversation:updated",
      expect.any(Function),
    );
    expect(socketDisconnectMock).toHaveBeenCalled();
  });

  it("does not show badge when total unread is 0", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
      },
    ]);

    render(<Sidebar />);

    await waitFor(() => {
      expect(screen.getByText("Direct messages")).toBeInTheDocument();
    });

    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
