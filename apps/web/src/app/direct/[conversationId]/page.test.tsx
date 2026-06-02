import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import DirectConversationPage from "./page";
import { listDirectMessages, sendDirectMessage, markDirectConversationRead, listDirectConversations } from "@/lib/direct-conversations-api";

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

let mockSocketConnected = false;

function makeMockSocket() {
  return {
    on: socketOnMock,
    off: socketOffMock,
    emit: socketEmitMock,
    disconnect: socketDisconnectMock,
    get connected() {
      return mockSocketConnected;
    },
  };
}

vi.mock("next/navigation", () => ({
  useParams: () => ({ conversationId: "dc1" }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: "u1", email: "a@b.com", username: "alice" },
    accessToken: "token",
  }),
}));

vi.mock("@/lib/direct-conversations-api", () => ({
  listDirectMessages: vi.fn(),
  sendDirectMessage: vi.fn(),
  markDirectConversationRead: vi.fn().mockResolvedValue({ ok: true }),
  listDirectConversations: vi.fn(),
}));

vi.mock("@/lib/socket-client", () => ({
  createSocket: vi.fn(() => makeMockSocket()),
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.setItem("accessToken", "token");
  vi.clearAllMocks();
  Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  Object.keys(socketOffHandlers).forEach((k) => delete socketOffHandlers[k]);
  mockSocketConnected = false;
  vi.mocked(listDirectConversations).mockResolvedValue([
    {
      id: "dc1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
      lastMessage: null,
      unreadCount: 0,
    },
  ]);
});

function mockMessages(messagesData: unknown[] = []) {
  vi.mocked(listDirectMessages).mockResolvedValueOnce(messagesData as ReturnType<typeof listDirectMessages>);
}

describe("DirectConversationPage — locale", () => {
  it("renders English shell labels by default", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText(/Back to direct messages/i)).toBeInTheDocument();
    });
    expect(await screen.findByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("renders Ukrainian shell labels when locale is uk", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText(/Назад до особистих повідомлень/i)).toBeInTheDocument();
    });
    expect(await screen.findByRole("button", { name: "Надіслати" })).toBeInTheDocument();
  });

  it("renders Russian shell labels when locale is ru", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText(/Назад к личным сообщениям/i)).toBeInTheDocument();
    });
    expect(await screen.findByRole("button", { name: "Отправить" })).toBeInTheDocument();
  });
});

describe("DirectConversationPage — composer", () => {
  it("shows empty messages state", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();
    });
  });

  it("shows validation error on empty submit and does not call sendDirectMessage", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole("button", { name: /Send/i }));

    expect(await screen.findByText(/Message cannot be empty/i)).toBeInTheDocument();
    expect(sendDirectMessage).not.toHaveBeenCalled();
  });

  it("shows validation error on whitespace-only submit", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "   \n\n   ");
    fireEvent.submit(screen.getByRole("button", { name: /Send/i }));

    expect(await screen.findByText(/Message cannot be empty/i)).toBeInTheDocument();
    expect(sendDirectMessage).not.toHaveBeenCalled();
  });

  it("sends message, clears textarea, and appends to list on success", async () => {
    mockMessages([]);
    const newMsg = {
      id: "dm1",
      conversationId: "dc1",
      content: "Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
    };
    vi.mocked(sendDirectMessage).mockResolvedValueOnce(newMsg);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalledWith("token", "dc1", { content: "Hello" });
    });

    expect(screen.getByPlaceholderText(/Type a message/i)).toHaveValue("");
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("shows loading state while sending", async () => {
    mockMessages([]);
    let resolveSend: (value: unknown) => void;
    const sendPromise = new Promise((resolve) => {
      resolveSend = resolve;
    });
    vi.mocked(sendDirectMessage).mockImplementationOnce(() => sendPromise as Promise<never>);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Hi");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    expect(screen.getByRole("button", { name: /Sending…/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Type a message/i)).toBeDisabled();

    resolveSend!({
      id: "dm2",
      conversationId: "dc1",
      content: "Hi",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Send/i })).toBeInTheDocument();
    });
  });

  it("shows backend error and preserves textarea content", async () => {
    mockMessages([]);
    vi.mocked(sendDirectMessage).mockRejectedValueOnce(new Error("Forbidden"));

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Secret");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    expect(await screen.findByText(/Forbidden/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Type a message/i)).toHaveValue("Secret");
  });

  it("scrolls to bottom after sending a message", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    mockMessages([]);
    const newMsg = {
      id: "dm1",
      conversationId: "dc1",
      content: "Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
    };
    vi.mocked(sendDirectMessage).mockResolvedValueOnce(newMsg);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalled();
    });

    expect(scrollIntoViewMock).toHaveBeenCalled();
    scrollIntoViewMock.mockRestore();
  });
});

describe("DirectConversationPage — composer focus", () => {
  it("focuses composer textarea after page loads", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);
    const textarea = await screen.findByPlaceholderText(/Type a message/i);
    await waitFor(() => {
      expect(textarea).toHaveFocus();
    });
  });

  it("keeps composer focused after sending a message", async () => {
    mockMessages([]);
    const newMsg = {
      id: "dm1",
      conversationId: "dc1",
      content: "Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
    };
    vi.mocked(sendDirectMessage).mockResolvedValueOnce(newMsg);

    render(<DirectConversationPage />);

    const textarea = await screen.findByPlaceholderText(/Type a message/i);
    await userEvent.type(textarea, "Hello");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(textarea).toHaveFocus();
    });
  });
});

describe("DirectConversationPage — message author identity", () => {
  it("shows author displayName when available", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob Smith", avatarUrl: null },
        parent: null,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    });
  });

  it("falls back to username when displayName is null", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        parent: null,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("bob")).toBeInTheDocument();
    });
  });

  it("shows avatar image when avatarUrl exists", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: "/uploads/avatars/u2/test.png" },
        parent: null,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(document.querySelector("img[src='http://localhost:3001/uploads/avatars/u2/test.png']")).toBeInTheDocument();
    });
  });

  it("shows fallback initials when avatarUrl is null", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("BO")).toBeInTheDocument();
    });
  });
});

describe("DirectConversationPage — loads messages", () => {
  it("loads and displays messages", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "First message",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        parent: null,
      },
      {
        id: "dm2",
        conversationId: "dc1",
        content: "Second message",
        parentId: null,
        createdAt: "2024-01-01T00:01:00Z",
        updatedAt: "2024-01-01T00:01:00Z",
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("First message")).toBeInTheDocument();
    });
    expect(screen.getByText("Second message")).toBeInTheDocument();
  });
});

describe("DirectConversationPage — socket", () => {
  it("joins direct conversation socket room on server connected event", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("connected", expect.any(Function));
    });

    const connectedHandler = socketHandlers["connected"];
    connectedHandler();

    await waitFor(() => {
      expect(socketEmitMock).toHaveBeenCalledWith("direct:join", { conversationId: "dc1" });
    });
  });

  it("emits direct:join even when socket is already connected before effect completes", async () => {
    mockSocketConnected = true;
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketEmitMock).toHaveBeenCalledWith("direct:join", { conversationId: "dc1" });
    });
  });

  it("rejoins direct room after reconnect", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("connected", expect.any(Function));
    });

    const connectedHandler = socketHandlers["connected"];
    connectedHandler();
    connectedHandler();

    await waitFor(() => {
      expect(socketEmitMock.mock.calls.filter((c) => c[0] === "direct:join").length).toBe(2);
    });
  });

  it("leaves direct conversation socket room on unmount", async () => {
    mockMessages([]);
    const { unmount } = render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    unmount();

    await waitFor(() => {
      expect(socketEmitMock).toHaveBeenCalledWith("direct:leave", { conversationId: "dc1" });
    });
    expect(socketDisconnectMock).toHaveBeenCalled();
  });

  it("cleans up direct socket listeners on unmount", async () => {
    mockMessages([]);
    const { unmount } = render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    unmount();

    expect(socketOffMock).toHaveBeenCalledWith("connected", expect.any(Function));
    expect(socketOffMock).toHaveBeenCalledWith("direct:message:created", expect.any(Function));
    expect(socketOffMock).toHaveBeenCalledWith("direct:joined", expect.any(Function));
    expect(socketOffMock).toHaveBeenCalledWith("direct:error", expect.any(Function));
    expect(socketOffMock).toHaveBeenCalledWith("connect_error", expect.any(Function));
    expect(socketOffMock).toHaveBeenCalledWith("disconnect", expect.any(Function));
  });

  it("appends incoming direct:message:created", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:message:created", expect.any(Function));
    });

    const handler = socketHandlers["direct:message:created"];
    handler({
      id: "dm-live",
      conversationId: "dc1",
      content: "Live message",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
      parent: null,
    });

    await waitFor(() => {
      expect(screen.getByText("Live message")).toBeInTheDocument();
    });
  });

  it("ignores duplicate incoming message by id", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        parent: null,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Original")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:message:created"];
    handler({
      id: "dm1",
      conversationId: "dc1",
      content: "Original",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
      parent: null,
    });

    expect(screen.getAllByText("Original").length).toBe(1);
  });

  it("ignores socket message for another conversation", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:message:created", expect.any(Function));
    });

    const handler = socketHandlers["direct:message:created"];
    handler({
      id: "dm-other",
      conversationId: "dc-other",
      content: "Other conv",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
      parent: null,
    });

    expect(screen.queryByText("Other conv")).not.toBeInTheDocument();
  });

  it("sending message via HTTP still appends once if socket event also fires", async () => {
    mockMessages([]);
    const newMsg = {
      id: "dm1",
      conversationId: "dc1",
      content: "Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
    };
    vi.mocked(sendDirectMessage).mockResolvedValueOnce(newMsg);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalled();
    });

    const handler = socketHandlers["direct:message:created"];
    handler(newMsg);

    expect(screen.getAllByText("Hello").length).toBe(1);
  });

  it("shows realtime error when direct:error is received", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:error", expect.any(Function));
    });

    const handler = socketHandlers["direct:error"];
    handler({ message: "Access denied" });

    await waitFor(() => {
      expect(screen.getByText(/Access denied/i)).toBeInTheDocument();
    });
  });
});

describe("DirectConversationPage — mark as read", () => {
  it("calls markDirectConversationRead on page load", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(markDirectConversationRead).toHaveBeenCalledWith("token", "dc1");
    });
  });

  it("dispatches direct-conversations:changed after successful mark-read on load", async () => {
    mockMessages([]);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(markDirectConversationRead).toHaveBeenCalledWith("token", "dc1");
    });

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith(
        new CustomEvent("direct-conversations:changed"),
      );
    });

    dispatchSpy.mockRestore();
  });

  it("does not crash if mark-read fails on load", async () => {
    mockMessages([]);
    vi.mocked(markDirectConversationRead).mockRejectedValueOnce(new Error("Network"));

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(markDirectConversationRead).toHaveBeenCalledWith("token", "dc1");
    });

    // Page should still render normally
    expect(await screen.findByPlaceholderText(/Type a message/i)).toBeInTheDocument();
  });

  it("calls markDirectConversationRead for incoming message while conversation is open", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:message:created", expect.any(Function));
    });

    const handler = socketHandlers["direct:message:created"];
    handler({
      id: "dm-live",
      conversationId: "dc1",
      content: "Live message",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
      parent: null,
    });

    await waitFor(() => {
      expect(markDirectConversationRead).toHaveBeenCalledWith("token", "dc1");
    });
  });

  it("dispatches direct-conversations:changed after mark-read for incoming message", async () => {
    mockMessages([]);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:message:created", expect.any(Function));
    });

    const handler = socketHandlers["direct:message:created"];
    handler({
      id: "dm-live",
      conversationId: "dc1",
      content: "Live message",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
      parent: null,
    });

    await waitFor(() => {
      expect(markDirectConversationRead).toHaveBeenCalledWith("token", "dc1");
    });

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith(
        new CustomEvent("direct-conversations:changed"),
      );
    });

    dispatchSpy.mockRestore();
  });
});

describe("DirectConversationPage — layout and bubbles", () => {
  it("renders messages inside scrollable chat panel", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-messages-scroll")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-message-row-dm1")).toBeInTheDocument();
  });

  it("composer is visible after messages", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-composer")).toBeInTheDocument();
    });
  });

  it("renders own message with emerald bubble styling", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "My message",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-bubble-dm1")).toBeInTheDocument();
    });

    const bubble = screen.getByTestId("direct-message-bubble-dm1");
    expect(bubble.className).toContain("bg-emerald-50");
    expect(bubble.className).toContain("border-emerald-200");
  });

  it("renders other message with white bubble styling", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Other message",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        parent: null,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-bubble-dm1")).toBeInTheDocument();
    });

    const bubble = screen.getByTestId("direct-message-bubble-dm1");
    expect(bubble.className).toContain("bg-white");
    expect(bubble.className).toContain("border-zinc-200");
  });

  it("indents own bubble compared to other bubble", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "My message",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-bubble-wrap-dm1")).toBeInTheDocument();
    });

    const wrap = screen.getByTestId("direct-message-bubble-wrap-dm1");
    expect(wrap.className).toContain("ml-28");
  });

  it("shows other participant name in header", async () => {
    mockMessages([]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });
    expect(screen.getByText("charlie")).toBeInTheDocument();
  });

  it("shows unknown user when conversation not found", async () => {
    mockMessages([]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText(/Back to direct messages/i)).toBeInTheDocument();
    });
    // Header participant section should not render when conversation is null
    expect(screen.queryByText("bob")).not.toBeInTheDocument();
  });
});
