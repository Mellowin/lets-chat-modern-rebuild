import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import DirectMessagesPage from "./page";
import { useAuth } from "@/lib/auth-context";
import { listDirectConversations, createDirectConversation, type DirectConversation } from "@/lib/direct-conversations-api";

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
const socketEmitMock = vi.fn();
const socketDisconnectMock = vi.fn();

function makeMockSocket() {
  return {
    on: socketOnMock,
    off: socketOffMock,
    emit: socketEmitMock,
    disconnect: socketDisconnectMock,
    get connected() {
      return false;
    },
  };
}

const routerPushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/direct-conversations-api", () => ({
  listDirectConversations: vi.fn(),
  createDirectConversation: vi.fn(),
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

function mockConversation(overrides?: Partial<DirectConversation>): DirectConversation {
  return {
    id: "dc1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    otherParticipant: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
    lastMessage: { id: "dm1", content: "Hey", createdAt: "2024-01-01T00:00:00Z", authorId: "u2" },
    unreadCount: 3,
    isOnline: false,
    ...overrides,
  };
}

describe("DirectMessagesPage — unauthenticated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows auth required message in English by default", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      isAuthenticated: false,
      loginSuccess: vi.fn(),
      setUser: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>);

    render(<DirectMessagesPage />);

    expect(screen.getByText(/Authentication required/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in/i })).toBeInTheDocument();
  });
});

describe("DirectMessagesPage — list conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(listDirectConversations).mockResolvedValue([]);
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
    Object.keys(socketOffHandlers).forEach((k) => delete socketOffHandlers[k]);
  });

  it("shows loading state", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockImplementation(() => new Promise(() => {}));

    render(<DirectMessagesPage />);

    expect(await screen.findByText(/Loading conversations/i)).toBeInTheDocument();
  });

  it("shows empty state when no conversations", async () => {
    mockAuth();

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText(/No conversations yet/i)).toBeInTheDocument();
    });
  });

  it("lists conversations with other participant name", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([
      mockConversation(),
    ]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
    expect(screen.getByText("Hey")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bob/i })).toHaveAttribute("href", "/direct/dc1");
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows error when loading fails", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockRejectedValue(new Error("Network error"));

    render(<DirectMessagesPage />);

    expect(await screen.findByText(/Network error/i)).toBeInTheDocument();
  });
});

describe("DirectMessagesPage — start conversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(listDirectConversations).mockResolvedValue([]);
  });

  it("starts conversation by username and navigates", async () => {
    mockAuth();
    vi.mocked(createDirectConversation).mockResolvedValue({
      id: "dc2",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      otherParticipant: { id: "u3", username: "charlie", displayName: null, avatarUrl: null },
      lastMessage: null,
    });

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "charlie");
    await userEvent.click(screen.getByRole("button", { name: /Start chat/i }));

    await waitFor(() => {
      expect(createDirectConversation).toHaveBeenCalledWith("token", { usernameOrEmail: "charlie" });
    });
    expect(routerPushMock).toHaveBeenCalledWith("/direct/dc2");
  });

  it("shows error when start conversation fails", async () => {
    mockAuth();
    vi.mocked(createDirectConversation).mockRejectedValue(new Error("User not found"));

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "unknown");
    await userEvent.click(screen.getByRole("button", { name: /Start chat/i }));

    expect(await screen.findByText(/User not found/i)).toBeInTheDocument();
  });

  it("shows self conversation error from backend", async () => {
    mockAuth();
    vi.mocked(createDirectConversation).mockRejectedValue(
      new Error("Cannot create a conversation with yourself"),
    );

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "alice");
    await userEvent.click(screen.getByRole("button", { name: /Start chat/i }));

    expect(
      await screen.findByText(/Cannot create a conversation with yourself/i),
    ).toBeInTheDocument();
  });

  it("does not submit when input is empty", async () => {
    mockAuth();

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Start chat/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Start chat/i }));

    expect(createDirectConversation).not.toHaveBeenCalled();
  });
});

describe("DirectMessagesPage — locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(listDirectConversations).mockResolvedValue([]);
  });

  it("shows Ukrainian labels when locale is uk", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockAuth();

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Особисті повідомлення/i, level: 1 })).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/Імʼя користувача або email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Почати чат/i })).toBeInTheDocument();
  });

  it("shows Russian labels when locale is ru", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockAuth();

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Личные сообщения/i, level: 1 })).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/Имя пользователя или email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Начать чат/i })).toBeInTheDocument();
  });
});

describe("DirectMessagesPage — socket unread updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
    Object.keys(socketOffHandlers).forEach((k) => delete socketOffHandlers[k]);
  });

  it("increments unreadCount for message from other user", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([mockConversation({ unreadCount: 1 })]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    handler({
      id: "dm-new",
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
      expect(screen.getByText("2")).toBeInTheDocument();
    });
    expect(screen.getByText("New msg")).toBeInTheDocument();
  });

  it("does NOT increment unreadCount for own message", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([mockConversation({ unreadCount: 1 })]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    handler({
      id: "dm-own",
      conversationId: "dc1",
      content: "My msg",
      parentId: null,
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
    });

    await waitFor(() => {
      expect(screen.getByText("My msg")).toBeInTheDocument();
    });
    // unreadCount should stay 1, not become 2
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("does not double-increment on duplicate socket event", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([mockConversation({ unreadCount: 0 })]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    const msg = {
      id: "dm-dup",
      conversationId: "dc1",
      content: "Dup",
      parentId: null,
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
      parent: null,
    };

    handler(msg);
    handler(msg);

    await waitFor(() => {
      expect(screen.getByText("Dup")).toBeInTheDocument();
    });
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("moves conversation to top for own message", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([
      mockConversation({ id: "dc1", updatedAt: "2024-01-01T00:00:00Z", unreadCount: 0 }),
      mockConversation({ id: "dc2", updatedAt: "2024-01-02T00:00:00Z", unreadCount: 0, otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null }, lastMessage: { id: "dm2", content: "Later", createdAt: "2024-01-02T00:00:00Z", authorId: "u3" } }),
    ]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    handler({
      id: "dm-own",
      conversationId: "dc1",
      content: "My msg",
      parentId: null,
      createdAt: "2024-01-03T00:00:00Z",
      updatedAt: "2024-01-03T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
    });

    await waitFor(() => {
      expect(screen.getByText("My msg")).toBeInTheDocument();
    });

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/direct/dc1");
  });

  it("moves conversation to top for other user message", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([
      mockConversation({ id: "dc1", updatedAt: "2024-01-01T00:00:00Z", unreadCount: 0 }),
      mockConversation({ id: "dc2", updatedAt: "2024-01-02T00:00:00Z", unreadCount: 0, otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null }, lastMessage: { id: "dm2", content: "Later", createdAt: "2024-01-02T00:00:00Z", authorId: "u3" } }),
    ]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    handler({
      id: "dm-other",
      conversationId: "dc1",
      content: "Other msg",
      parentId: null,
      createdAt: "2024-01-03T00:00:00Z",
      updatedAt: "2024-01-03T00:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
      parent: null,
    });

    await waitFor(() => {
      expect(screen.getByText("Other msg")).toBeInTheDocument();
    });

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/direct/dc1");
  });

  it("dispatches direct-conversations:changed after state update via microtask", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([mockConversation({ unreadCount: 0 })]);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    handler({
      id: "dm-new",
      conversationId: "dc1",
      content: "New msg",
      parentId: null,
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
      parent: null,
    });

    // Flush deferred side effects (setTimeout 0)
    await new Promise((resolve) => setTimeout(resolve, 0));

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith(
        new CustomEvent("direct-conversations:changed"),
      );
    });

    dispatchSpy.mockRestore();
  });

  it("does not produce React setState warning during socket update", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([mockConversation({ unreadCount: 0 })]);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    handler({
      id: "dm-new",
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
      expect(screen.getByText("New msg")).toBeInTheDocument();
    });

    // Flush deferred side effects (setTimeout 0)
    await new Promise((resolve) => setTimeout(resolve, 0));

    const reactWarning = consoleErrorSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("Cannot update a component") &&
        call[0].includes("while rendering a different component"),
    );
    expect(reactWarning).toBeUndefined();

    consoleErrorSpy.mockRestore();
  });

  it("reloads unknown conversation via microtask, not inside updater", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([mockConversation({ unreadCount: 0 })]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    handler({
      id: "dm-unknown",
      conversationId: "dc-unknown",
      content: "Unknown",
      parentId: null,
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
      parent: null,
    });

    // Flush deferred side effects (setTimeout 0)
    await new Promise((resolve) => setTimeout(resolve, 0));

    await waitFor(() => {
      expect(listDirectConversations).toHaveBeenCalledTimes(2);
    });
  });

  it("updates preview content on edit of last message without incrementing unread or moving to top", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([
      mockConversation({ id: "dc2", updatedAt: "2024-01-02T00:00:00Z", unreadCount: 0, otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null }, lastMessage: { id: "dm2", content: "Later", createdAt: "2024-01-02T00:00:00Z", authorId: "u3" } }),
      mockConversation({ id: "dc1", updatedAt: "2024-01-01T00:00:00Z", unreadCount: 1 }),
    ]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    handler({
      id: "dm1",
      conversationId: "dc1",
      content: "Edited",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: "2024-01-03T00:00:00Z",
      author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
      parent: null,
    });

    await waitFor(() => {
      expect(screen.getByText("Edited")).toBeInTheDocument();
    });

    // unread count should stay 1
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();

    // order should not change (dc2 still first)
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/direct/dc2");
  });

  it("updates preview to previous message on delete refresh payload without moving to top", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([
      mockConversation({ id: "dc2", updatedAt: "2024-01-02T00:00:00Z", unreadCount: 0, otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null }, lastMessage: { id: "dm2", content: "Later", createdAt: "2024-01-02T00:00:00Z", authorId: "u3" } }),
      mockConversation({ id: "dc1", updatedAt: "2024-01-01T00:00:00Z", unreadCount: 1 }),
    ]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("Hey")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    handler({
      conversationId: "dc1",
      updatedAt: "2024-01-01T00:00:00Z",
      lastMessage: { id: "dm0", content: "Previous", createdAt: "2024-01-01T00:00:00Z", authorId: "u2" },
    });

    await waitFor(() => {
      expect(screen.getByText("Previous")).toBeInTheDocument();
    });

    // unread count should stay 1
    expect(screen.getByText("1")).toBeInTheDocument();

    // order should not change (dc2 still first)
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/direct/dc2");
  });

  it("shows no messages when delete refresh payload has lastMessage null", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([mockConversation({ unreadCount: 1 })]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("Hey")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:conversation:updated"];
    handler({
      conversationId: "dc1",
      updatedAt: "2024-01-01T00:00:00Z",
      lastMessage: null,
    });

    await waitFor(() => {
      expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();
    });

    expect(screen.queryByText("Hey")).not.toBeInTheDocument();
  });

  it("shows offline presence dot by default", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([mockConversation({ isOnline: false })]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-list-presence-dc1")).toBeInTheDocument();
    });
  });

  it("shows online presence dot when other participant is online", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([mockConversation({ isOnline: true })]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      const dot = screen.getByTestId("direct-list-presence-dot-dc1");
      expect(dot).toHaveClass("bg-emerald-500");
    });
  });

  it("updates presence to online on presence:online for matching row", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([mockConversation({ isOnline: false })]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      const dot = screen.getByTestId("direct-list-presence-dot-dc1");
      expect(dot).toHaveClass("bg-zinc-400");
    });

    const handler = socketHandlers["presence:online"];
    handler({ user: { id: "u2", username: "bob" }, status: "online" });

    await waitFor(() => {
      const dot = screen.getByTestId("direct-list-presence-dot-dc1");
      expect(dot).toHaveClass("bg-emerald-500");
    });
  });

  it("updates presence to offline on presence:offline for matching row", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([mockConversation({ isOnline: true })]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      const dot = screen.getByTestId("direct-list-presence-dot-dc1");
      expect(dot).toHaveClass("bg-emerald-500");
    });

    const handler = socketHandlers["presence:offline"];
    handler({ user: { id: "u2", username: "bob" }, status: "offline" });

    await waitFor(() => {
      const dot = screen.getByTestId("direct-list-presence-dot-dc1");
      expect(dot).toHaveClass("bg-zinc-400");
    });
  });

  it("does not change unread count on presence event", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([mockConversation({ unreadCount: 3, isOnline: false })]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    const handler = socketHandlers["presence:online"];
    handler({ user: { id: "u2", username: "bob" }, status: "online" });

    await waitFor(() => {
      const dot = screen.getByTestId("direct-list-presence-dot-dc1");
      expect(dot).toHaveClass("bg-emerald-500");
    });

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not move row to top on presence event", async () => {
    mockAuth();
    vi.mocked(listDirectConversations).mockResolvedValue([
      mockConversation({ id: "dc2", updatedAt: "2024-01-02T00:00:00Z", unreadCount: 0, otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null }, lastMessage: { id: "dm2", content: "Later", createdAt: "2024-01-02T00:00:00Z", authorId: "u3" } }),
      mockConversation({ id: "dc1", updatedAt: "2024-01-01T00:00:00Z", unreadCount: 1 }),
    ]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    const handler = socketHandlers["presence:online"];
    handler({ user: { id: "u2", username: "bob" }, status: "online" });

    await waitFor(() => {
      const dot = screen.getByTestId("direct-list-presence-dot-dc1");
      expect(dot).toHaveClass("bg-emerald-500");
    });

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/direct/dc2");
  });
});
