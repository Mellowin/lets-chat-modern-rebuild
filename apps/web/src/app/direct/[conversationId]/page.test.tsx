import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import DirectConversationPage from "./page";
import { listDirectMessages, sendDirectMessage, markDirectConversationRead, listDirectConversations, updateDirectMessage, deleteDirectMessage } from "@/lib/direct-conversations-api";
import type { DirectMessage } from "@/lib/direct-conversations-api";
import { createSocketMock } from "@/test/socket-mock";

const { socketHandlers, socketOnMock, socketOffMock, socketDisconnectMock, clearSocketHandlers } =
  createSocketMock();
const socketEmitMock = vi.fn();

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

const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useParams: () => ({ conversationId: "dc1" }),
  useRouter: () => ({ push: routerPushMock }),
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
  reactToDirectMessage: vi.fn(),
  removeDirectMessageReaction: vi.fn(),
  updateDirectMessage: vi.fn(),
  deleteDirectMessage: vi.fn(),
}));

vi.mock("@/lib/socket-client", () => ({
  createSocket: vi.fn(() => makeMockSocket()),
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.setItem("accessToken", "token");
  vi.clearAllMocks();
  clearSocketHandlers();
  mockSocketConnected = false;
  routerPushMock.mockClear();
  vi.mocked(deleteDirectMessage).mockReset();
  vi.mocked(listDirectConversations).mockResolvedValue([
    {
      id: "dc1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
      lastMessage: null,
      unreadCount: 0,
      isOnline: false,
    },
  ]);
});

function mockMessages(messagesData: unknown[] = []) {
  vi.mocked(listDirectMessages).mockResolvedValueOnce(messagesData as DirectMessage[]);
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Live message")).toBeInTheDocument();
    });
  });

  it("ignores duplicate incoming message by id", async () => {
    vi.mocked(markDirectConversationRead).mockImplementation(() => new Promise(() => {}));
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    expect(screen.getAllByText("Original").length).toBe(1);
    vi.mocked(markDirectConversationRead).mockResolvedValue({ ok: true });
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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

describe("DirectConversationPage — presence", () => {
  it("shows Offline by default", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });
  });

  it("shows Online when other participant is online from initial load", async () => {
    mockMessages([]);
    vi.mocked(listDirectConversations).mockResolvedValue([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: true,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeInTheDocument();
    });
  });

  it("updates to Online on presence:online from other user", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });

    const handler = socketHandlers["presence:online"];
    handler({ user: { id: "u3", username: "charlie" }, status: "online" });

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeInTheDocument();
    });
  });

  it("updates to Offline on presence:offline from other user", async () => {
    mockMessages([]);
    vi.mocked(listDirectConversations).mockResolvedValue([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: true,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeInTheDocument();
    });

    const handler = socketHandlers["presence:offline"];
    handler({ user: { id: "u3", username: "charlie" }, status: "offline" });

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });
  });

  it("ignores presence:online from self", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });

    const handler = socketHandlers["presence:online"];
    handler({ user: { id: "u1", username: "alice" }, status: "online" });

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });
  });

  it("ignores presence event from unrelated user", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });

    const handler = socketHandlers["presence:online"];
    handler({ user: { id: "u99", username: "stranger" }, status: "online" });

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-messages-scroll")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("direct-message-row-dm1")).toBeInTheDocument();
    });
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
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
    expect(screen.getByTestId("direct-presence-status")).toBeInTheDocument();
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

describe("DirectConversationPage — read receipts", () => {
  it("shows Sent for own unread message", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-read-receipt-dm1")).toHaveTextContent("Sent");
    });
  });

  it("shows Seen for own read message", async () => {
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
        reactions: [],
        readByOtherParticipant: true,
        isUnreadForMe: false,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-read-receipt-dm1")).toHaveTextContent("Seen");
    });
  });

  it("does not show read receipt for other user's message", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-row-dm1")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("direct-read-receipt-dm1")).not.toBeInTheDocument();
  });

  it("updates own message to Seen on direct:conversation:read from other participant", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-read-receipt-dm1")).toHaveTextContent("Sent");
    });

    socketHandlers["connected"]?.();
    socketHandlers["direct:conversation:read"]?.({
      conversationId: "dc1",
      userId: "u3",
      readAt: "2024-01-01T12:00:00Z",
    });

    await waitFor(() => {
      expect(screen.getByTestId("direct-read-receipt-dm1")).toHaveTextContent("Seen");
    });
  });

  it("ignores direct:conversation:read from self", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-read-receipt-dm1")).toHaveTextContent("Sent");
    });

    socketHandlers["connected"]?.();
    socketHandlers["direct:conversation:read"]?.({
      conversationId: "dc1",
      userId: "u1",
      readAt: "2024-01-01T12:00:00Z",
    });

    await waitFor(() => {
      expect(screen.getByTestId("direct-read-receipt-dm1")).toHaveTextContent("Sent");
    });
  });

  it("ignores direct:conversation:read for another conversation", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-read-receipt-dm1")).toHaveTextContent("Sent");
    });

    socketHandlers["connected"]?.();
    socketHandlers["direct:conversation:read"]?.({
      conversationId: "dc2",
      userId: "u3",
      readAt: "2024-01-01T12:00:00Z",
    });

    await waitFor(() => {
      expect(screen.getByTestId("direct-read-receipt-dm1")).toHaveTextContent("Sent");
    });
  });

  it("new own message initially shows Sent", async () => {
    mockMessages([]);
    vi.mocked(sendDirectMessage).mockResolvedValueOnce({
      id: "dm-new",
      conversationId: "dc1",
      content: "New msg",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    render(<DirectConversationPage />);
    await waitFor(() => {
      expect(screen.getByTestId("direct-composer")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/type a message/i);
    await userEvent.type(textarea, "New msg");
    const form = screen.getByTestId("direct-composer");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByTestId("direct-read-receipt-dm-new")).toHaveTextContent("Sent");
    });
  });
});

describe("DirectConversationPage — reply action", () => {
  it("renders Reply action on direct messages", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();

    });
    expect(screen.getByTestId("direct-reply-action-dm1")).toHaveTextContent(/Reply/i);
  });

  it("clicking Reply opens composer reply preview", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original message",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });
  });

  it("reply preview shows author name and original snippet", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original message text",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });
    expect(screen.getByText(/Replying to/i)).toBeInTheDocument();
    expect(screen.getByTestId("direct-reply-preview")).toHaveTextContent("Bob");
    expect(screen.getByTestId("direct-reply-preview")).toHaveTextContent("Original message text");
  });

  it("cancel reply clears preview", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-cancel-reply"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reply-preview")).not.toBeInTheDocument();
    });
  });
});

describe("DirectConversationPage — send with parentId", () => {
  it("sending while reply preview active calls sendDirectMessage with parentId", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const newMsg = {
      id: "dm2",
      conversationId: "dc1",
      content: "Reply text",
      parentId: "dm1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: {
        id: "dm1",
        content: "Original",
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      },
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    };
    vi.mocked(sendDirectMessage).mockResolvedValueOnce(newMsg);

    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Reply text");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalledWith("token", "dc1", { content: "Reply text", parentId: "dm1" });
    });
  });

  it("after successful send, reply preview clears", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const newMsg = {
      id: "dm2",
      conversationId: "dc1",
      content: "Reply text",
      parentId: "dm1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: {
        id: "dm1",
        content: "Original",
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      },
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    };
    vi.mocked(sendDirectMessage).mockResolvedValueOnce(newMsg);

    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Reply text");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reply-preview")).not.toBeInTheDocument();
    });
  });

  it("after failed send, reply preview remains", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(sendDirectMessage).mockRejectedValueOnce(new Error("Network"));

    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Reply text");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(screen.getByText(/Network/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
  });
});

describe("DirectConversationPage — quote preview", () => {
  it("reply message with loaded parent renders quote preview inside bubble", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original message",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
      {
        id: "dm2",
        conversationId: "dc1",
        content: "Reply message",
        parentId: "dm1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: {
          id: "dm1",
          content: "Original message",
          author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        },
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-quote-preview-dm2")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-quote-preview-dm2")).toHaveTextContent("Bob");
    expect(screen.getByTestId("direct-quote-preview-dm2")).toHaveTextContent("Original message");
  });

  it("reply message with missing parent renders fallback text", async () => {
    mockMessages([
      {
        id: "dm2",
        conversationId: "dc1",
        content: "Reply message",
        parentId: "dm1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-quote-preview-dm2")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-quote-preview-dm2")).toHaveTextContent(/Original message is not loaded/i);
  });

  it("quote preview click scrolls to original message", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original message",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
      {
        id: "dm2",
        conversationId: "dc1",
        content: "Reply message",
        parentId: "dm1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-quote-preview-dm2")).toBeInTheDocument();
    });

    const quoteButton = screen.getByTestId("direct-quote-preview-dm2").querySelector("button");
    expect(quoteButton).toBeTruthy();
    if (quoteButton) await userEvent.click(quoteButton);

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });

    scrollIntoViewMock.mockRestore();
  });

  it("quote preview click highlights original message", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original message",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
      {
        id: "dm2",
        conversationId: "dc1",
        content: "Reply message",
        parentId: "dm1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-quote-preview-dm2")).toBeInTheDocument();
    });

    const quoteButton = screen.getByTestId("direct-quote-preview-dm2").querySelector("button");
    expect(quoteButton).toBeTruthy();
    if (quoteButton) await userEvent.click(quoteButton);

    await waitFor(() => {
      const row = screen.getByTestId("direct-message-row-dm1");
      expect(row.className).toContain("bg-yellow-100/70");
    });
  });

  it("highlight clears after timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original message",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
      {
        id: "dm2",
        conversationId: "dc1",
        content: "Reply message",
        parentId: "dm1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-quote-preview-dm2")).toBeInTheDocument();
    });

    const quoteButton = screen.getByTestId("direct-quote-preview-dm2").querySelector("button");
    expect(quoteButton).toBeTruthy();
    if (quoteButton) await userEvent.click(quoteButton);

    await waitFor(() => {
      const row = screen.getByTestId("direct-message-row-dm1");
      expect(row.className).toContain("bg-yellow-100/70");
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      const row = screen.getByTestId("direct-message-row-dm1");
      expect(row.className).not.toContain("bg-yellow-100/70");
    });

    vi.useRealTimers();
  });
});

describe("DirectConversationPage — reply realtime", () => {
  it("incoming socket reply message appends and displays quote preview", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:message:created", expect.any(Function));
    });

    const handler = socketHandlers["direct:message:created"];
    handler({
      id: "dm-live",
      conversationId: "dc1",
      content: "Live reply",
      parentId: "dm1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      parent: {
        id: "dm1",
        content: "Original",
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      },
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Live reply")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-quote-preview-dm-live")).toBeInTheDocument();
    expect(screen.getByTestId("direct-quote-preview-dm-live")).toHaveTextContent("Bob");
  });

  it("duplicate incoming reply socket event does not duplicate message", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:message:created", expect.any(Function));
    });

    const handler = socketHandlers["direct:message:created"];
    const replyMsg = {
      id: "dm-live",
      conversationId: "dc1",
      content: "Live reply",
      parentId: "dm1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      parent: {
        id: "dm1",
        content: "Original",
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      },
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    };
    handler(replyMsg);
    handler(replyMsg);

    await waitFor(() => {
      expect(screen.getByText("Live reply")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Live reply").length).toBe(1);
  });
});


describe("DirectConversationPage — forward action", () => {
  it("renders Forward action on each direct message", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });
    expect(screen.getByTestId("direct-forward-action-dm1")).toHaveTextContent(/Forward/i);
  });

  it("clicking Forward opens forward picker", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });
  });

  it("forward picker shows message preview", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Message to forward",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });
    expect(screen.getByText(/Forward message/i)).toBeInTheDocument();
    expect(screen.getByTestId("direct-forward-picker")).toHaveTextContent("Message to forward");
    expect(screen.getByTestId("direct-forward-picker")).toHaveTextContent("Bob");
  });

  it("cancel closes forward picker", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-cancel-forward"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-forward-picker")).not.toBeInTheDocument();
    });
  });
});

describe("DirectConversationPage — forward target list", () => {
  it("loads direct conversations when forward picker opens", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-target-dc2")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-forward-target-dc2")).toHaveTextContent("Dave");
  });

  it("excludes current conversation from target list", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-target-dc2")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("direct-forward-target-dc1")).not.toBeInTheDocument();
  });

  it("shows no-targets message when there are no other conversations", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });
    expect(screen.getByText(/No other direct conversations/i)).toBeInTheDocument();
  });
});

describe("DirectConversationPage — send forward", () => {
  it("selecting target calls sendDirectMessage with target conversation id", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    vi.mocked(sendDirectMessage).mockResolvedValueOnce({
      id: "dm-fwd",
      conversationId: "dc2",
      content: "↪ Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-target-dc2")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-target-dc2"));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalledWith("token", "dc2", { content: "↪ Hello" });
    });
  });

  it("forwarded content includes prefix ↪ ", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original text",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    vi.mocked(sendDirectMessage).mockResolvedValueOnce({
      id: "dm-fwd",
      conversationId: "dc2",
      content: "↪ Original text",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-target-dc2")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-target-dc2"));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalledWith("token", "dc2", { content: "↪ Original text" });
    });
  });

  it("successful forward closes picker", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    vi.mocked(sendDirectMessage).mockResolvedValueOnce({
      id: "dm-fwd",
      conversationId: "dc2",
      content: "↪ Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-target-dc2")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-target-dc2"));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("direct-forward-picker")).not.toBeInTheDocument();
    });
  });

  it("failed forward keeps picker open and shows error", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    vi.mocked(sendDirectMessage).mockRejectedValueOnce(new Error("Network error"));

    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-target-dc2")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-target-dc2"));

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
  });

  it("dispatches direct-conversations:changed after successful forward", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    vi.mocked(sendDirectMessage).mockResolvedValueOnce({
      id: "dm-fwd",
      conversationId: "dc2",
      content: "↪ Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-target-dc2")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-target-dc2"));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalledWith(
        new CustomEvent("direct-conversations:changed"),
      );
    });

    dispatchSpy.mockRestore();
  });
});

describe("DirectConversationPage — forward regression", () => {
  it("Reply still works after Forward action exists", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });
  });

  it("Send normal message still works when Forward action exists", async () => {
    mockMessages([]);
    const newMsg = {
      id: "dm1",
      conversationId: "dc1",
      content: "Normal message",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    };
    vi.mocked(sendDirectMessage).mockResolvedValueOnce(newMsg);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Normal message");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalledWith("token", "dc1", { content: "Normal message" });
    });

    expect(screen.getByText("Normal message")).toBeInTheDocument();
  });

  it("Realtime incoming direct message still appends after forward UI added", async () => {
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Live message")).toBeInTheDocument();
    });
  });
});


describe("DirectConversationPage — reactions", () => {
  it("renders quick reaction buttons on messages", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-react-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-react-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-picker-dm1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-reaction-option-dm1-👍")).toBeInTheDocument();
    expect(screen.getByTestId("direct-reaction-option-dm1-❤️")).toBeInTheDocument();
  });

  it("renders reaction chips with count", async () => {
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
        reactions: [{ emoji: "👍", count: 2, reactedByMe: false }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toHaveTextContent("👍2");
  });

  it("reactedByMe chip has active styling", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });
    const chip = screen.getByTestId("direct-reaction-chip-dm1-👍");
    expect(chip.className).toContain("bg-emerald-50");
  });
});

describe("DirectConversationPage — reaction socket", () => {
  it("socket direct:reaction:added updates reaction chip live", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:reaction:added", expect.any(Function));
    });

    const handler = socketHandlers["direct:reaction:added"];
    handler({
      messageId: "dm1",
      conversationId: "dc1",
      emoji: "👍",
      user: { id: "u2", username: "bob" },
      reactions: [{ emoji: "👍", count: 1, reactedByMe: false }],
    });

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toHaveTextContent("👍1");
  });

  it("socket direct:reaction:removed updates reaction chip live", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: false }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:reaction:removed"];
    handler({
      messageId: "dm1",
      conversationId: "dc1",
      emoji: "👍",
      user: { id: "u2", username: "bob" },
      reactions: [],
    });

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });
  });

  it("reaction socket events do not duplicate messages", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    const addedHandler = socketHandlers["direct:reaction:added"];
    addedHandler({
      messageId: "dm1",
      conversationId: "dc1",
      emoji: "👍",
      user: { id: "u2", username: "bob" },
      reactions: [{ emoji: "👍", count: 1, reactedByMe: false }],
    });

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    expect(screen.getAllByText("Hello").length).toBe(1);
  });
});

describe("DirectConversationPage — reaction regression", () => {
  it("reply still works after reaction UI added", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });
  });

  it("forward still works after reaction UI added", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {

      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();

    });


    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));


    await waitFor(() => {

      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();

    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });
  });
});


describe("DirectConversationPage — B89b reactedByMe viewer safety", () => {
  it("socket added from another user updates count but reactedByMe stays false", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:reaction:added", expect.any(Function));
    });

    const handler = socketHandlers["direct:reaction:added"];
    handler({
      messageId: "dm1",
      conversationId: "dc1",
      emoji: "👍",
      user: { id: "u2", username: "bob" },
      reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
    });

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });
    const chip = screen.getByTestId("direct-reaction-chip-dm1-👍");
    expect(chip).toHaveTextContent("👍1");
    expect(chip.className).not.toContain("bg-emerald-50");
  });

  it("socket added from self sets reactedByMe true", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:reaction:added", expect.any(Function));
    });

    const handler = socketHandlers["direct:reaction:added"];
    handler({
      messageId: "dm1",
      conversationId: "dc1",
      emoji: "👍",
      user: { id: "u1", username: "alice" },
      reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
    });

    await waitFor(() => {
      const chip = screen.getByTestId("direct-reaction-chip-dm1-👍");
      expect(chip.className).toContain("bg-emerald-50");
    });
  });

  it("another user adds same emoji after current user reacted — count updates, reactedByMe stays true", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:reaction:added"];
    handler({
      messageId: "dm1",
      conversationId: "dc1",
      emoji: "👍",
      user: { id: "u2", username: "bob" },
      reactions: [{ emoji: "👍", count: 2, reactedByMe: true }],
    });

    await waitFor(() => {
      const chip = screen.getByTestId("direct-reaction-chip-dm1-👍");
      expect(chip).toHaveTextContent("👍2");
      expect(chip.className).toContain("bg-emerald-50");
    });
  });

  it("another user removes emoji but current user still reacted — count drops, reactedByMe stays true", async () => {
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
        reactions: [{ emoji: "👍", count: 2, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:reaction:removed"];
    handler({
      messageId: "dm1",
      conversationId: "dc1",
      emoji: "👍",
      user: { id: "u2", username: "bob" },
      reactions: [{ emoji: "👍", count: 1, reactedByMe: false }],
    });

    await waitFor(() => {
      const chip = screen.getByTestId("direct-reaction-chip-dm1-👍");
      expect(chip).toHaveTextContent("👍1");
      expect(chip.className).toContain("bg-emerald-50");
    });
  });

  it("current user removes own emoji via socket — reactedByMe becomes false", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:reaction:removed"];
    handler({
      messageId: "dm1",
      conversationId: "dc1",
      emoji: "👍",
      user: { id: "u1", username: "alice" },
      reactions: [],
    });

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });
  });

  it("final reaction removed from another user and current user never reacted — chip disappears", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: false }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:reaction:removed"];
    handler({
      messageId: "dm1",
      conversationId: "dc1",
      emoji: "👍",
      user: { id: "u2", username: "bob" },
      reactions: [],
    });

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });
  });

  it("clicking quick emoji updates local UI after API success", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { reactToDirectMessage: reactMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(reactMock).mockResolvedValueOnce([{ emoji: "👍", count: 1, reactedByMe: true }]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-react-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-react-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-option-dm1-👍")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-option-dm1-👍"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });
    const chip = screen.getByTestId("direct-reaction-chip-dm1-👍");
    expect(chip).toHaveTextContent("👍1");
    expect(chip.className).toContain("bg-emerald-50");
  });

  it("clicking own chip removes local active state after API success", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { removeDirectMessageReaction: removeMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(removeMock).mockResolvedValueOnce([]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-chip-dm1-👍"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });
  });
});


describe("DirectConversationPage — B90 menu UI", () => {
  it("does not show Reply/Forward/React text buttons before menu opens", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("direct-message-menu-dm1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("direct-reaction-picker-dm1")).not.toBeInTheDocument();
  });

  it("emoji options are not visible before reaction picker opens", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("direct-reaction-option-dm1-👍")).not.toBeInTheDocument();
  });

  it("reaction chips remain visible if message already has reactions", async () => {
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
        reactions: [{ emoji: "👍", count: 2, reactedByMe: false }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });
  });

  it("menu trigger renders for each message", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "First",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
      {
        id: "dm2",
        conversationId: "dc1",
        content: "Second",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-message-menu-trigger-dm2")).toBeInTheDocument();
  });

  it("clicking menu trigger opens menu", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
    });
  });

  it("menu contains Reply, React, Forward, Copy text", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
    });

    expect(screen.getByTestId("direct-reply-action-dm1")).toHaveTextContent(/Reply/i);
    expect(screen.getByTestId("direct-react-action-dm1")).toHaveTextContent(/React/i);
    expect(screen.getByTestId("direct-forward-action-dm1")).toHaveTextContent(/Forward/i);
    expect(screen.getByTestId("direct-copy-text-action-dm1")).toHaveTextContent(/Copy text/i);
  });

  it("clicking outside closes menu", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
    });

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByTestId("direct-message-menu-dm1")).not.toBeInTheDocument();
    });
  });

  it("pressing Escape closes menu", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("direct-message-menu-dm1")).not.toBeInTheDocument();
    });
  });

  it("clicking Reply from menu opens reply preview and closes menu", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("direct-message-menu-dm1")).not.toBeInTheDocument();
  });

  it("clicking React from menu opens reaction picker and closes menu", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-react-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-react-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-picker-dm1")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("direct-message-menu-dm1")).not.toBeInTheDocument();
  });

  it("selecting emoji from picker calls reaction API and closes picker", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { reactToDirectMessage: reactMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(reactMock).mockResolvedValueOnce([{ emoji: "👍", count: 1, reactedByMe: true }]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-react-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-react-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-option-dm1-👍")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-option-dm1-👍"));

    await waitFor(() => {
      expect(reactMock).toHaveBeenCalledWith("token", "dc1", "dm1", "👍");
    });
    expect(screen.queryByTestId("direct-reaction-picker-dm1")).not.toBeInTheDocument();
  });

  it("clicking Forward from menu opens forward picker and closes menu", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("direct-message-menu-dm1")).not.toBeInTheDocument();
  });

  it("clicking Copy text calls navigator.clipboard.writeText with message content and closes menu", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Message to copy",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-copy-text-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-copy-text-action-dm1"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("Message to copy");
    });
    expect(screen.queryByTestId("direct-message-menu-dm1")).not.toBeInTheDocument();
  });
});

describe("DirectConversationPage — B90 regression", () => {
  it("direct send still works", async () => {
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("direct reply send still works via menu", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const newMsg = {
      id: "dm2",
      conversationId: "dc1",
      content: "Reply text",
      parentId: "dm1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: {
        id: "dm1",
        content: "Original",
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      },
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    };
    vi.mocked(sendDirectMessage).mockResolvedValueOnce(newMsg);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Reply text");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalledWith("token", "dc1", { content: "Reply text", parentId: "dm1" });
    });
  });

  it("direct forward send still works via menu", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    vi.mocked(sendDirectMessage).mockResolvedValueOnce({
      id: "dm-fwd",
      conversationId: "dc2",
      content: "↪ Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-target-dc2")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-target-dc2"));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalledWith("token", "dc2", { content: "↪ Hello" });
    });
  });

  it("reaction chip toggle still works", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { removeDirectMessageReaction: removeMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(removeMock).mockResolvedValueOnce([]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-chip-dm1-👍"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });
  });
});


describe("DirectConversationPage — B91 one reaction per user", () => {
  it("selecting different emoji replaces previous active chip", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { reactToDirectMessage: reactMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(reactMock).mockResolvedValueOnce([{ emoji: "❤️", count: 1, reactedByMe: true }]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-react-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-react-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-option-dm1-❤️")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-option-dm1-❤️"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });

    const heartChip = screen.getByTestId("direct-reaction-chip-dm1-❤️");
    expect(heartChip).toBeInTheDocument();
    expect(heartChip.className).toContain("bg-emerald-50");
  });

  it("same user cannot have two active emoji chips on same message after replacement", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { reactToDirectMessage: reactMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(reactMock).mockResolvedValueOnce([
      { emoji: "❤️", count: 1, reactedByMe: true },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-react-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-react-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-option-dm1-❤️")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-option-dm1-❤️"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-❤️")).toBeInTheDocument();
    });

    const activeChips = screen.getAllByTestId(/direct-reaction-chip-dm1-/);
    expect(activeChips.length).toBe(1);
  });

  it("clicking active chip removes it", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { removeDirectMessageReaction: removeMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(removeMock).mockResolvedValueOnce([]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-chip-dm1-👍"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });
  });

  it("socket replacement from self replaces active chip", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:reaction:added", expect.any(Function));
    });

    const handler = socketHandlers["direct:reaction:added"];
    handler({
      messageId: "dm1",
      conversationId: "dc1",
      emoji: "❤️",
      user: { id: "u1", username: "alice" },
      reactions: [{ emoji: "❤️", count: 1, reactedByMe: true }],
    });

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });

    const heartChip = screen.getByTestId("direct-reaction-chip-dm1-❤️");
    expect(heartChip).toBeInTheDocument();
    expect(heartChip.className).toContain("bg-emerald-50");
  });

  it("socket replacement from other user preserves my active emoji", async () => {
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
        reactions: [{ emoji: "👍", count: 2, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:reaction:added", expect.any(Function));
    });

    const handler = socketHandlers["direct:reaction:added"];
    handler({
      messageId: "dm1",
      conversationId: "dc1",
      emoji: "❤️",
      user: { id: "u2", username: "bob" },
      reactions: [
        { emoji: "👍", count: 1, reactedByMe: false },
        { emoji: "❤️", count: 1, reactedByMe: true },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-❤️")).toBeInTheDocument();
    });

    const thumbChip = screen.getByTestId("direct-reaction-chip-dm1-👍");
    expect(thumbChip).toBeInTheDocument();
    expect(thumbChip.className).toContain("bg-emerald-50");

    const heartChip = screen.getByTestId("direct-reaction-chip-dm1-❤️");
    expect(heartChip.className).not.toContain("bg-emerald-50");
  });
});

describe("DirectConversationPage — B91 regression", () => {
  it("B90 menu remains hidden/clean", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("direct-message-menu-dm1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("direct-reply-action-dm1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("direct-forward-action-dm1")).not.toBeInTheDocument();
  });

  it("reply still works after B91", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });
  });

  it("forward still works after B91", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });
  });

  it("send still works after B91", async () => {
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("mark-read on load still works after B91", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(markDirectConversationRead).toHaveBeenCalledWith("token", "dc1");
    });
  });
});


describe("DirectConversationPage — B92 navigate after forward", () => {
  it("successful forward to different conversation calls router.push with target path", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    vi.mocked(sendDirectMessage).mockResolvedValueOnce({
      id: "dm-fwd",
      conversationId: "dc2",
      content: "↪ Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-target-dc2")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-target-dc2"));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalledWith("token", "dc2", { content: "↪ Hello" });
    });

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/direct/dc2");
    });
  });

  it("successful forward closes picker before navigating", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    vi.mocked(sendDirectMessage).mockResolvedValueOnce({
      id: "dm-fwd",
      conversationId: "dc2",
      content: "↪ Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-target-dc2")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-target-dc2"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-forward-picker")).not.toBeInTheDocument();
    });

    expect(routerPushMock).toHaveBeenCalledWith("/direct/dc2");
  });

  it("failed forward does not call router.push and keeps picker open", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    vi.mocked(sendDirectMessage).mockRejectedValueOnce(new Error("Network error"));

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-target-dc2")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-target-dc2"));

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });

    expect(routerPushMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
  });
});

describe("DirectConversationPage — B92 regression", () => {
  it("menu Forward action still opens forward picker", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });
  });

  it("direct send still works", async () => {
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("reply still works", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });
  });

  it("reactions still work", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { removeDirectMessageReaction: removeMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(removeMock).mockResolvedValueOnce([]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-chip-dm1-👍"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });
  });
});


describe("DirectConversationPage — B93 menu positioning", () => {
  function withRect(rect: Partial<DOMRect>, fn: () => void | Promise<void>) {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
      top: 200,
      left: 100,
      right: 120,
      bottom: 220,
      width: 20,
      height: 20,
      x: 100,
      y: 200,
      toJSON: () => {},
      ...rect,
    })) as unknown as typeof HTMLElement.prototype.getBoundingClientRect;
    return (async () => {
      try {
        await fn();
      } finally {
        HTMLElement.prototype.getBoundingClientRect = original;
      }
    })();
  }

  it("menu renders as fixed overlay", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
    });

    const menu = screen.getByTestId("direct-message-menu-dm1");
    expect(menu.className).toContain("fixed");
  });

  it("menu opens to the right of trigger when enough space", async () => {
    await withRect({ top: 200, left: 100, right: 120, bottom: 220 }, async () => {
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
          reactions: [],
          readByOtherParticipant: false,
          isUnreadForMe: false,
        },
      ]);
      render(<DirectConversationPage />);

      await waitFor(() => {
        expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

      await waitFor(() => {
        expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
      });

      const menu = screen.getByTestId("direct-message-menu-dm1");
      expect(menu.style.left).toBe("128px");
    });
  });

  it("menu is clamped vertically when trigger is near bottom", async () => {
    await withRect({ top: 700, left: 100, right: 120, bottom: 720 }, async () => {
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
          reactions: [],
          readByOtherParticipant: false,
          isUnreadForMe: false,
        },
      ]);
      render(<DirectConversationPage />);

      await waitFor(() => {
        expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

      await waitFor(() => {
        expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
      });

      const menu = screen.getByTestId("direct-message-menu-dm1");
      expect(menu.style.top).toBe("576px");
    });
  });

  it("right-click bubble opens fixed menu", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-bubble-dm1")).toBeInTheDocument();
    });

    fireEvent.contextMenu(screen.getByTestId("direct-message-bubble-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
    });

    const menu = screen.getByTestId("direct-message-menu-dm1");
    expect(menu.className).toContain("fixed");
  });

  it("clicking React in menu opens fixed reaction picker", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-react-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-react-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-picker-dm1")).toBeInTheDocument();
    });

    const picker = screen.getByTestId("direct-reaction-picker-dm1");
    expect(picker.className).toContain("fixed");
  });

  it("selecting emoji from fixed reaction picker closes it", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { reactToDirectMessage: reactMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(reactMock).mockResolvedValueOnce([{ emoji: "👍", count: 1, reactedByMe: true }]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-react-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-react-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-picker-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-option-dm1-👍"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-picker-dm1")).not.toBeInTheDocument();
    });
  });

  it("scrolling messages closes fixed menu and picker", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
    });

    fireEvent.scroll(screen.getByTestId("direct-messages-scroll"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-message-menu-dm1")).not.toBeInTheDocument();
    });
  });

  it("outside click closes fixed menu", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
    });

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByTestId("direct-message-menu-dm1")).not.toBeInTheDocument();
    });
  });

  it("Escape closes fixed menu", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("direct-message-menu-dm1")).not.toBeInTheDocument();
    });
  });
});

describe("DirectConversationPage — B93 regression", () => {
  it("reply still works via fixed menu", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });
  });

  it("forward still works via fixed menu", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });
  });

  it("copy text still works via fixed menu", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Message to copy",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-copy-text-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-copy-text-action-dm1"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("Message to copy");
    });
  });

  it("direct send still works", async () => {
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("reaction chip toggle still works", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { removeDirectMessageReaction: removeMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(removeMock).mockResolvedValueOnce([]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-chip-dm1-👍"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });
  });
});


describe("DirectConversationPage — B97 edit", () => {
  it("edit action is visible for own messages in menu", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-action-dm1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-edit-action-dm1")).toHaveTextContent(/Edit/i);
  });

  it("edit action is not visible for other user's messages", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("direct-edit-action-dm1")).not.toBeInTheDocument();
  });

  it("clicking Edit from menu opens edit preview and fills composer", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original text",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-edit-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-preview")).toBeInTheDocument();
    });

    expect(screen.getByTestId("direct-edit-preview")).toHaveTextContent(/Editing message/i);
    expect(screen.getByTestId("direct-edit-preview")).toHaveTextContent(/Original text/i);

    const textarea = screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Original text");

    expect(screen.queryByTestId("direct-message-menu-dm1")).not.toBeInTheDocument();
  });

  it("clicking cancel edit clears preview and composer", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original text",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-edit-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-preview")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-cancel-edit"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-edit-preview")).not.toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("saving edit calls update API and updates message in list", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original text",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);

    const updatedMsg = {
      id: "dm1",
      conversationId: "dc1",
      content: "Edited text",
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: new Date().toISOString(),
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    };
    vi.mocked(updateDirectMessage).mockResolvedValueOnce(updatedMsg);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-edit-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-preview")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Type a message/i);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Edited text");

    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(updateDirectMessage).toHaveBeenCalledWith("token", "dc1", "dm1", { content: "Edited text" });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("direct-edit-preview")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Edited text")).toBeInTheDocument();
    expect(screen.queryByText("Original text")).not.toBeInTheDocument();
  });

  it("socket direct:message:updated replaces message in list", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:message:updated", expect.any(Function));
    });

    const handler = socketHandlers["direct:message:updated"];
    handler({
      id: "dm1",
      conversationId: "dc1",
      content: "Updated via socket",
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: new Date().toISOString(),
      author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Updated via socket")).toBeInTheDocument();
    });
    expect(screen.queryByText("Original")).not.toBeInTheDocument();
  });

  it("socket ignores updated messages for other conversations", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await screen.findByText("Original");

    const handler = socketHandlers["direct:message:updated"];
    handler({
      id: "dm1",
      conversationId: "dc99",
      content: "Updated via socket",
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: new Date().toISOString(),
      author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    expect(screen.getByText("Original")).toBeInTheDocument();
    expect(screen.queryByText("Updated via socket")).not.toBeInTheDocument();
  });

  it("edited marker appears when message has editedAt", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: new Date().toISOString(),
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    expect(screen.getByText(/edited/i)).toBeInTheDocument();
  });
});

describe("DirectConversationPage — B97 regression", () => {
  it("direct send still works", async () => {
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("reply still works via menu", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });
  });

  it("forward still works via menu", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });
  });

  it("reactions still work", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { removeDirectMessageReaction: removeMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(removeMock).mockResolvedValueOnce([]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-chip-dm1-👍"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });
  });

  it("mark-read on load still works", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(markDirectConversationRead).toHaveBeenCalledWith("token", "dc1");
    });
  });
});

describe("DirectConversationPage — B100 typing indicator", () => {
  it("typing indicator hidden by default", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-composer")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("direct-typing-indicator")).not.toBeInTheDocument();
  });

  it("receiving direct:typing true from other user shows indicator", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketHandlers["direct:typing"]).toBeDefined();
    });

    const handler = socketHandlers["direct:typing"];
    handler({
      conversationId: "dc1",
      user: { id: "u2", username: "bob", displayName: "Bob" },
      isTyping: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId("direct-typing-indicator")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-typing-indicator")).toHaveTextContent(/Bob is typing/i);
  });

  it("receiving direct:typing false hides indicator", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketHandlers["direct:typing"]).toBeDefined();
    });

    const handler = socketHandlers["direct:typing"];
    handler({
      conversationId: "dc1",
      user: { id: "u2", username: "bob", displayName: "Bob" },
      isTyping: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId("direct-typing-indicator")).toBeInTheDocument();
    });

    handler({
      conversationId: "dc1",
      user: { id: "u2", username: "bob", displayName: "Bob" },
      isTyping: false,
    });

    await waitFor(() => {
      expect(screen.queryByTestId("direct-typing-indicator")).not.toBeInTheDocument();
    });
  });

  it("typing event from current user is ignored", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketHandlers["direct:typing"]).toBeDefined();
    });

    const handler = socketHandlers["direct:typing"];
    handler({
      conversationId: "dc1",
      user: { id: "u1", username: "alice", displayName: null },
      isTyping: true,
    });

    expect(screen.queryByTestId("direct-typing-indicator")).not.toBeInTheDocument();
  });

  it("typing event from another conversation is ignored", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketHandlers["direct:typing"]).toBeDefined();
    });

    const handler = socketHandlers["direct:typing"];
    handler({
      conversationId: "other-conv",
      user: { id: "u2", username: "bob", displayName: "Bob" },
      isTyping: true,
    });

    expect(screen.queryByTestId("direct-typing-indicator")).not.toBeInTheDocument();
  });

  it("indicator auto-hides after timeout", async () => {
    mockMessages([]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketHandlers["direct:typing"]).toBeDefined();
    });

    const handler = socketHandlers["direct:typing"];
    handler({
      conversationId: "dc1",
      user: { id: "u2", username: "bob", displayName: "Bob" },
      isTyping: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId("direct-typing-indicator")).toBeInTheDocument();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    await waitFor(() => {
      expect(screen.queryByTestId("direct-typing-indicator")).not.toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it("typing in composer emits direct:typing:start", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "H");

    await waitFor(() => {
      expect(socketEmitMock).toHaveBeenCalledWith("direct:typing:start", { conversationId: "dc1" });
    });
  });

  it("stopping typing emits direct:typing:stop after debounce", async () => {
    mockMessages([]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "H");

    await waitFor(() => {
      expect(socketEmitMock).toHaveBeenCalledWith("direct:typing:start", { conversationId: "dc1" });
    });

    vi.advanceTimersByTime(1200);

    await waitFor(() => {
      expect(socketEmitMock).toHaveBeenCalledWith("direct:typing:stop", { conversationId: "dc1" });
    });

    vi.useRealTimers();
  });

  it("submitting message emits direct:typing:stop", async () => {
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    };
    vi.mocked(sendDirectMessage).mockResolvedValueOnce(newMsg);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(socketEmitMock).toHaveBeenCalledWith("direct:typing:stop", { conversationId: "dc1" });
    });
  });

  it("clearing composer emits direct:typing:stop", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Type a message/i);
    await userEvent.type(textarea, "Hello");
    await userEvent.clear(textarea);

    await waitFor(() => {
      expect(socketEmitMock).toHaveBeenCalledWith("direct:typing:stop", { conversationId: "dc1" });
    });
  });

  it("send still works", async () => {
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("edit still works", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { updateDirectMessage: updateMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(updateMock).mockResolvedValueOnce({
      id: "dm1",
      conversationId: "dc1",
      content: "Updated",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: new Date().toISOString(),
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-action-dm1")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("direct-edit-action-dm1"));

    const textarea = screen.getByPlaceholderText(/Type a message/i);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Updated");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "dc1", "dm1", { content: "Updated" });
    });
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });

  it("delete still works", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(deleteDirectMessage).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-delete-action-dm1")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("direct-delete-action-dm1"));

    await waitFor(() => {
      expect(deleteDirectMessage).toHaveBeenCalledWith("token", "dc1", "dm1");
    });
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("reactions still work", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { reactToDirectMessage: reactMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(reactMock).mockResolvedValueOnce([{ emoji: "👍", count: 1, reactedByMe: true }]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-react-action-dm1")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("direct-react-action-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-option-dm1-👍")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("direct-reaction-option-dm1-👍"));

    await waitFor(() => {
      expect(reactMock).toHaveBeenCalledWith("token", "dc1", "dm1", "👍");
    });
  });
});


describe("DirectConversationPage — B98 delete", () => {
  it("Delete action appears for own message", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-delete-action-dm1")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-delete-action-dm1")).toHaveTextContent(/Delete/i);
  });

  it("Delete action does not appear for other user's message", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-dm1")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("direct-delete-action-dm1")).not.toBeInTheDocument();
  });

  it("cancel confirm does not call API and keeps message", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.stubGlobal("confirm", vi.fn(() => false));

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-delete-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-delete-action-dm1"));

    expect(deleteDirectMessage).not.toHaveBeenCalled();
    expect(screen.getByText("Hello")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("confirm delete calls API and removes message from DOM", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(deleteDirectMessage).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-delete-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-delete-action-dm1"));

    await waitFor(() => {
      expect(deleteDirectMessage).toHaveBeenCalledWith("token", "dc1", "dm1");
    });

    await waitFor(() => {
      expect(screen.queryByText("Hello")).not.toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("failed delete keeps message visible", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(deleteDirectMessage).mockRejectedValueOnce(new Error("Network error"));
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-delete-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-delete-action-dm1"));

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("socket direct:message:deleted removes message", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:message:deleted", expect.any(Function));
    });

    const handler = socketHandlers["direct:message:deleted"];
    handler({ conversationId: "dc1", messageId: "dm1" });

    await waitFor(() => {
      expect(screen.queryByText("Hello")).not.toBeInTheDocument();
    });
  });

  it("socket delete does not duplicate/append", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketOnMock).toHaveBeenCalledWith("direct:message:deleted", expect.any(Function));
    });

    const handler = socketHandlers["direct:message:deleted"];
    handler({ conversationId: "dc1", messageId: "dm1" });
    handler({ conversationId: "dc1", messageId: "dm1" });

    await waitFor(() => {
      expect(screen.queryByText("Hello")).not.toBeInTheDocument();
    });
  });

  it("deleting message currently being edited clears edit mode", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(deleteDirectMessage).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-edit-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-preview")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-delete-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-delete-action-dm1"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-edit-preview")).not.toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("deleting message currently being replied to clears reply preview", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(deleteDirectMessage).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-delete-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-delete-action-dm1"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reply-preview")).not.toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("deleting message currently being forwarded closes forward picker", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    vi.mocked(deleteDirectMessage).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-delete-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-delete-action-dm1"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-forward-picker")).not.toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("reply whose parent was deleted shows missing fallback", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Parent",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
      {
        id: "dm2",
        conversationId: "dc1",
        content: "Reply",
        parentId: "dm1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: { id: "dm1", content: "Parent", author: { id: "u1", username: "alice", displayName: null, avatarUrl: null } },
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(deleteDirectMessage).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-delete-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-delete-action-dm1"));

    await waitFor(() => {
      expect(screen.queryByText("Parent")).not.toBeInTheDocument();
    });

    // The reply should still be visible with missing fallback
    expect(screen.getByTestId("direct-message-bubble-dm2")).toHaveTextContent(/Reply/);
    expect(screen.getByTestId("direct-quote-preview-dm2")).toHaveTextContent(/Original message is not loaded/i);

    vi.unstubAllGlobals();
  });
});

describe("DirectConversationPage — B98 regression", () => {
  it("direct send still works", async () => {
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("edit still works", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { updateDirectMessage: updateMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(updateMock).mockResolvedValueOnce({
      id: "dm1",
      conversationId: "dc1",
      content: "Updated",
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: new Date().toISOString(),
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-edit-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-preview")).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Type a message/i);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Updated");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "dc1", "dm1", { content: "Updated" });
    });
  });

  it("reply still works via menu", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });
  });

  it("forward still works via menu", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });
  });

  it("reactions still work", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { removeDirectMessageReaction: removeMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(removeMock).mockResolvedValueOnce([]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-chip-dm1-👍"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });
  });

  it("copy text still works via menu", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Message to copy",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-copy-text-action-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-copy-text-action-dm1"));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("Message to copy");
    });
  });

  it("mark-read on load still works", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(markDirectConversationRead).toHaveBeenCalledWith("token", "dc1");
    });
  });
});


describe("DirectConversationPage — unread separator", () => {
  it("no separator when no unread messages", async () => {
    vi.mocked(markDirectConversationRead).mockImplementation(() => new Promise(() => {}));
    mockMessages([
      {
        id: "dm1",
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
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("direct-unread-separator")).not.toBeInTheDocument();
  });

  it("separator appears before first unread incoming message", async () => {
    vi.mocked(markDirectConversationRead).mockImplementation(() => new Promise(() => {}));
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Old",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
      {
        id: "dm2",
        conversationId: "dc1",
        content: "Unread1",
        parentId: null,
        createdAt: "2024-01-01T01:00:00Z",
        updatedAt: "2024-01-01T01:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: true,
      },
      {
        id: "dm3",
        conversationId: "dc1",
        content: "Unread2",
        parentId: null,
        createdAt: "2024-01-01T02:00:00Z",
        updatedAt: "2024-01-01T02:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: true,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-unread-separator")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-unread-separator")).toHaveTextContent("Unread messages");
  });

  it("separator appears only once even with multiple unread messages", async () => {
    vi.mocked(markDirectConversationRead).mockImplementation(() => new Promise(() => {}));
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Old",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
      {
        id: "dm2",
        conversationId: "dc1",
        content: "Unread1",
        parentId: null,
        createdAt: "2024-01-01T01:00:00Z",
        updatedAt: "2024-01-01T01:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: true,
      },
      {
        id: "dm3",
        conversationId: "dc1",
        content: "Unread2",
        parentId: null,
        createdAt: "2024-01-01T02:00:00Z",
        updatedAt: "2024-01-01T02:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: true,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-unread-separator")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId("direct-unread-separator").length).toBe(1);
  });

  it("separator does not appear before own unread-like messages", async () => {
    vi.mocked(markDirectConversationRead).mockImplementation(() => new Promise(() => {}));
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Own",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
      {
        id: "dm2",
        conversationId: "dc1",
        content: "Own unread-like",
        parentId: null,
        createdAt: "2024-01-01T01:00:00Z",
        updatedAt: "2024-01-01T01:00:00Z",
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: true,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Own unread-like")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("direct-unread-separator")).not.toBeInTheDocument();
  });

  it("separator disappears after mark read succeeds", async () => {
    const resolvers: Array<() => void> = [];
    vi.mocked(markDirectConversationRead).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(() => resolve({ ok: true }));
        }),
    );
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Unread",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: true,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-unread-separator")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(resolvers.length).toBe(1);
    });
    resolvers[0]();

    await waitFor(() => {
      expect(screen.queryByTestId("direct-unread-separator")).not.toBeInTheDocument();
    });
  });

  it("incoming message while open does not create duplicate separator", async () => {
    const resolvers: Array<() => void> = [];
    vi.mocked(markDirectConversationRead).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(() => resolve({ ok: true }));
        }),
    );
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Unread",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: true,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-unread-separator")).toBeInTheDocument();
    });

    const handler = socketHandlers["direct:message:created"];
    handler({
      id: "dm-live",
      conversationId: "dc1",
      content: "Live",
      parentId: null,
      createdAt: "2024-01-01T01:00:00Z",
      updatedAt: "2024-01-01T01:00:00Z",
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Live")).toBeInTheDocument();
    });

    // Resolve the auto-mark-read triggered by incoming message
    await waitFor(() => {
      expect(resolvers.length).toBe(2);
    });
    resolvers[1]();

    // Auto-mark-read removes the separator; verify no duplicate ever appeared
    await waitFor(() => {
      expect(screen.queryByTestId("direct-unread-separator")).not.toBeInTheDocument();
    });
  });
});

describe("DirectConversationPage — B105 regression", () => {
  it("send still works", async () => {
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
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
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
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("edit still works", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { updateDirectMessage: updateMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(updateMock).mockResolvedValueOnce({
      id: "dm1",
      conversationId: "dc1",
      content: "Updated",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: new Date().toISOString(),
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-edit-action-dm1")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("direct-edit-action-dm1"));

    const textarea = screen.getByPlaceholderText(/Type a message/i);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Updated");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith("token", "dc1", "dm1", { content: "Updated" });
    });
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });

  it("delete still works", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(deleteDirectMessage).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-delete-action-dm1")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("direct-delete-action-dm1"));

    await waitFor(() => {
      expect(deleteDirectMessage).toHaveBeenCalledWith("token", "dc1", "dm1");
    });
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("reply still works", async () => {
    mockMessages([
      {
        id: "dm1",
        conversationId: "dc1",
        content: "Original",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        parent: null,
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const newMsg = {
      id: "dm2",
      conversationId: "dc1",
      content: "Reply",
      parentId: "dm1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: {
        id: "dm1",
        content: "Original",
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      },
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    };
    vi.mocked(sendDirectMessage).mockResolvedValueOnce(newMsg);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-action-dm1")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("direct-reply-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-reply-preview")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Reply");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalledWith("token", "dc1", { content: "Reply", parentId: "dm1" });
    });
  });

  it("forward still works", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u3", username: "charlie", displayName: "Charlie", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
      {
        id: "dc2",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u4", username: "dave", displayName: "Dave", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-message-menu-trigger-dm1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-message-menu-trigger-dm1"));
    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-action-dm1")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("direct-forward-action-dm1"));

    await waitFor(() => {
      expect(screen.getByTestId("direct-forward-picker")).toBeInTheDocument();
    });
  });

  it("reactions still work", async () => {
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
        reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);
    const { removeDirectMessageReaction: removeMock } = await import("@/lib/direct-conversations-api");
    vi.mocked(removeMock).mockResolvedValueOnce([]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-reaction-chip-dm1-👍")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("direct-reaction-chip-dm1-👍"));

    await waitFor(() => {
      expect(screen.queryByTestId("direct-reaction-chip-dm1-👍")).not.toBeInTheDocument();
    });
  });

  it("typing still works", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(socketHandlers["direct:typing"]).toBeDefined();
    });

    const handler = socketHandlers["direct:typing"];
    handler({
      conversationId: "dc1",
      user: { id: "u2", username: "bob", displayName: "Bob" },
      isTyping: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId("direct-typing-indicator")).toBeInTheDocument();
    });
    expect(screen.getByTestId("direct-typing-indicator")).toHaveTextContent(/Bob is typing/i);
  });

  it("presence still works", async () => {
    mockMessages([]);
    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });

    const handler = socketHandlers["presence:online"];
    handler({ user: { id: "u3", username: "charlie" }, status: "online" });

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeInTheDocument();
    });
  });

  it("read receipts still work", async () => {
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
        reactions: [],
        readByOtherParticipant: false,
        isUnreadForMe: false,
      },
    ]);

    render(<DirectConversationPage />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-read-receipt-dm1")).toHaveTextContent("Sent");
    });

    socketHandlers["connected"]?.();
    socketHandlers["direct:conversation:read"]?.({
      conversationId: "dc1",
      userId: "u3",
      readAt: "2024-01-01T12:00:00Z",
    });

    await waitFor(() => {
      expect(screen.getByTestId("direct-read-receipt-dm1")).toHaveTextContent("Seen");
    });
  });
});
