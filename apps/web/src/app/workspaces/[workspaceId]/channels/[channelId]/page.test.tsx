import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import ChannelDetailPage from "./page";
import { getChannel, getChannelMembers, addChannelMember, removeChannelMember, leaveChannel, archiveChannel, markChannelRead, type ChannelMember } from "@/lib/channels-api";
import { createChannelInvite } from "@/lib/channel-invites-api";
import { getMessages, createMessage, updateMessage, deleteMessage, addMessageReaction, removeMessageReaction, presignAttachmentUpload, uploadAttachmentToPresignedUrlWithProgress, getAttachmentDownloadUrl, getMessageContext, searchChannelMessages, Message } from "@/lib/messages-api";
import { sendDirectMessage, listDirectConversations } from "@/lib/direct-conversations-api";

const socketHandlers: Record<string, (...args: unknown[]) => void> = {};
const socketOnMock = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
  socketHandlers[event] = handler;
});
const socketEmitMock = vi.fn();
const socketDisconnectMock = vi.fn();

const routerPushMock = vi.fn();
const mockRouter = { push: routerPushMock };

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceId: "ws1", channelId: "ch1" }),
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

vi.mock("@/lib/channels-api", () => ({
  getChannel: vi.fn(),
  getChannelMembers: vi.fn(),
  addChannelMember: vi.fn(),
  removeChannelMember: vi.fn(),
  leaveChannel: vi.fn(),
  archiveChannel: vi.fn(),
  markChannelRead: vi.fn(() => Promise.resolve({ success: true, lastReadAt: "2024-01-01T00:00:00Z" })),
}));

vi.mock("@/lib/channel-invites-api", () => ({
  createChannelInvite: vi.fn(),
}));

vi.mock("@/lib/messages-api", () => ({
  getMessages: vi.fn(),
  createMessage: vi.fn(),
  updateMessage: vi.fn(),
  deleteMessage: vi.fn(),
  addMessageReaction: vi.fn(),
  removeMessageReaction: vi.fn(),
  presignAttachmentUpload: vi.fn(),
  uploadAttachmentToPresignedUrl: vi.fn(),
  uploadAttachmentToPresignedUrlWithProgress: vi.fn((_, __, onProgress) => {
    onProgress?.(100);
    return Promise.resolve();
  }),
  getAttachmentDownloadUrl: vi.fn(),
  getMessageContext: vi.fn(),
  searchChannelMessages: vi.fn(),
}));

vi.mock("@/lib/direct-conversations-api", () => ({
  sendDirectMessage: vi.fn(),
  listDirectConversations: vi.fn(),
}));

vi.mock("@/lib/socket-client", () => ({
  createSocket: vi.fn(() => ({
    on: socketOnMock,
    emit: socketEmitMock,
    disconnect: socketDisconnectMock,
    off: vi.fn(),
  })),
}));

beforeEach(() => {
  localStorage.clear();
});

function mockChannelAndMessages(messagesData: unknown[] = [], membersData: unknown[] = []) {
  vi.mocked(getChannel).mockResolvedValueOnce({
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
  });
  vi.mocked(getMessages).mockResolvedValueOnce(messagesData as Message[]);
  vi.mocked(getChannelMembers).mockResolvedValueOnce(membersData as ChannelMember[]);
}

describe("ChannelDetailPage — locale", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  });

  it("renders English shell labels by default", async () => {
    mockChannelAndMessages([], []);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Back to workspace/i)).toBeInTheDocument();
    });
    expect(await screen.findByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Members" })).toBeInTheDocument();
  });

  it("renders Ukrainian shell labels when locale is uk", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockChannelAndMessages([], []);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Назад до робочого простору/i)).toBeInTheDocument();
    });
    expect(await screen.findByRole("button", { name: "Надіслати" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Учасники" })).toBeInTheDocument();
  });

  it("renders Russian shell labels when locale is ru", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([], []);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Назад к рабочему пространству/i)).toBeInTheDocument();
    });
    expect(await screen.findByRole("button", { name: "Отправить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Участники" })).toBeInTheDocument();
  });

  it("shows Ukrainian socket status label", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockChannelAndMessages([], []);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Назад до робочого простору/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("Підключення")).toBeInTheDocument();
    });
  });

  it("shows Russian socket status label", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([], []);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Назад к рабочему пространству/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("Подключение")).toBeInTheDocument();
    });
  });
});

describe("ChannelDetailPage — composer", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
  });

  it("shows empty messages state", async () => {
    mockChannelAndMessages([]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/No messages yet/i)).toBeInTheDocument();
    });
  });

  it("renders composer below messages in DOM order", async () => {
    mockChannelAndMessages([
      {
        id: "m1",
        channelId: "ch1",
        content: "First message",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        reactions: [],
      },
    ]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("First message")).toBeInTheDocument();
    });

    const messageEl = screen.getByText("First message");
    const textareaEl = screen.getByPlaceholderText(/Type a message/i);

    expect(
      messageEl.compareDocumentPosition(textareaEl) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows validation error on empty submit and does not call createMessage", async () => {
    mockChannelAndMessages([]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole("button", { name: /Send/i }));

    expect(await screen.findByText(/Message cannot be empty/i)).toBeInTheDocument();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("shows validation error on whitespace-only submit", async () => {
    mockChannelAndMessages([]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "   \n\n   ");
    fireEvent.submit(screen.getByRole("button", { name: /Send/i }));

    expect(await screen.findByText(/Message cannot be empty/i)).toBeInTheDocument();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("shows Ukrainian validation error on empty submit", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockChannelAndMessages([]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Напишіть повідомлення/i)).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole("button", { name: /Надіслати/i }));

    expect(await screen.findByText(/Повідомлення не може бути порожнім/i)).toBeInTheDocument();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("shows Russian validation error on empty submit", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Напишите сообщение/i)).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole("button", { name: /Отправить/i }));

    expect(await screen.findByText(/Сообщение не может быть пустым/i)).toBeInTheDocument();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("shows Ukrainian validation error on whitespace-only submit", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockChannelAndMessages([]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Напишіть повідомлення/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Напишіть повідомлення/i), "   \n\n   ");
    fireEvent.submit(screen.getByRole("button", { name: /Надіслати/i }));

    expect(await screen.findByText(/Повідомлення не може бути порожнім/i)).toBeInTheDocument();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("shows Russian validation error on whitespace-only submit", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Напишите сообщение/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Напишите сообщение/i), "   \n\n   ");
    fireEvent.submit(screen.getByRole("button", { name: /Отправить/i }));

    expect(await screen.findByText(/Сообщение не может быть пустым/i)).toBeInTheDocument();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("sends message, clears textarea, and appends to list on success", async () => {
    mockChannelAndMessages([]);
    const newMsg = {
      id: "m1",
      channelId: "ch1",
      content: "Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      reactions: [],
    };
    vi.mocked(createMessage).mockResolvedValueOnce(newMsg);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(createMessage).toHaveBeenCalledWith("token", "ws1", "ch1", { content: "Hello" });
    });

    expect(screen.getByPlaceholderText(/Type a message/i)).toHaveValue("");
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("shows loading state while sending", async () => {
    mockChannelAndMessages([]);
    let resolveCreate: (value: unknown) => void;
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(createMessage).mockImplementationOnce(() => createPromise as Promise<never>);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Hi");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    expect(screen.getByRole("button", { name: /Sending…/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Type a message/i)).toBeDisabled();

    resolveCreate!({
      id: "m2",
      channelId: "ch1",
      content: "Hi",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      reactions: [],
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Send/i })).toBeInTheDocument();
    });
  });

  it("shows backend error and preserves textarea content", async () => {
    mockChannelAndMessages([]);
    vi.mocked(createMessage).mockRejectedValueOnce(new Error("Forbidden"));

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Secret");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    expect(await screen.findByText(/Forbidden/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Type a message/i)).toHaveValue("Secret");
  });

  it("shows Ukrainian fallback error when createMessage rejects with non-Error", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockChannelAndMessages([]);
    vi.mocked(createMessage).mockRejectedValueOnce("unknown failure");

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Напишіть повідомлення/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Напишіть повідомлення/i), "Hi");
    await userEvent.click(screen.getByRole("button", { name: /Надіслати/i }));

    expect(await screen.findByText(/Не вдалося надіслати повідомлення/i)).toBeInTheDocument();
  });

  it("shows Russian fallback error when createMessage rejects with non-Error", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([]);
    vi.mocked(createMessage).mockRejectedValueOnce("unknown failure");

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Напишите сообщение/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Напишите сообщение/i), "Hi");
    await userEvent.click(screen.getByRole("button", { name: /Отправить/i }));

    expect(await screen.findByText(/Не удалось отправить сообщение/i)).toBeInTheDocument();
  });

  it("scrolls to bottom after sending a message", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    mockChannelAndMessages([]);
    const newMsg = {
      id: "m1",
      channelId: "ch1",
      content: "Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      reactions: [],
    };
    vi.mocked(createMessage).mockResolvedValueOnce(newMsg);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(createMessage).toHaveBeenCalled();
    });

    expect(scrollIntoViewMock).toHaveBeenCalled();
    scrollIntoViewMock.mockRestore();
  });
});

describe("ChannelDetailPage — composer focus", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
  });

  it("focuses composer textarea after channel loads", async () => {
    mockChannelAndMessages([]);
    render(<ChannelDetailPage />);
    const textarea = await screen.findByPlaceholderText(/Type a message/i);
    await waitFor(() => {
      expect(textarea).toHaveFocus();
    });
  });

  it("marks channel as read after messages load", async () => {
    mockChannelAndMessages([]);
    vi.mocked(markChannelRead).mockResolvedValueOnce({ success: true, lastReadAt: "2024-01-01T00:00:00Z" });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(markChannelRead).toHaveBeenCalledWith("token", "ws1", "ch1");
    });
    const calls = dispatchSpy.mock.calls;
    const channelReadCall = calls.find((call) => {
      const event = call[0];
      return event instanceof CustomEvent && event.type === "channel:read";
    });
    expect(channelReadCall).toBeDefined();
    expect((channelReadCall![0] as CustomEvent).detail).toEqual({ channelId: "ch1" });

    dispatchSpy.mockRestore();
  });

  it("does not call markChannelRead more than once for the same channel load", async () => {
    mockChannelAndMessages([]);
    vi.mocked(markChannelRead).mockResolvedValue({ success: true, lastReadAt: "2024-01-01T00:00:00Z" });

    const { rerender } = render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(markChannelRead).toHaveBeenCalledTimes(1);
    });

    // Simulate a re-render with the same channel
    rerender(<ChannelDetailPage />);

    // Give any queued microtasks a chance to run
    await act(async () => {
      await Promise.resolve();
    });

    expect(markChannelRead).toHaveBeenCalledTimes(1);
  });

  it("does not crash when markChannelRead fails", async () => {
    mockChannelAndMessages([]);
    vi.mocked(markChannelRead).mockRejectedValueOnce(new Error("network"));
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(markChannelRead).toHaveBeenCalledWith("token", "ws1", "ch1");
    });
    const channelReadCall = dispatchSpy.mock.calls.find((call) => {
      const event = call[0];
      return event instanceof CustomEvent && event.type === "channel:read";
    });
    expect(channelReadCall).toBeUndefined();

    dispatchSpy.mockRestore();
  });

  it("keeps composer focused after sending a message", async () => {
    mockChannelAndMessages([]);
    const newMsg = {
      id: "m1",
      channelId: "ch1",
      content: "Hello",
      parentId: null,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      reactions: [],
    };
    vi.mocked(createMessage).mockResolvedValueOnce(newMsg);

    render(<ChannelDetailPage />);

    const textarea = await screen.findByPlaceholderText(/Type a message/i);
    await userEvent.type(textarea, "Hello");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(createMessage).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(textarea).toHaveFocus();
    });
  });
});

describe("ChannelDetailPage — message author identity", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
  });

  it("shows author displayName when available", async () => {
    mockChannelAndMessages([
      {
        id: "m1",
        channelId: "ch1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob Smith", avatarUrl: null },
        reactions: [],
      },
    ]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    });
  });

  it("falls back to username when displayName is null", async () => {
    mockChannelAndMessages([
      {
        id: "m1",
        channelId: "ch1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        reactions: [],
      },
    ]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("bob")).toBeInTheDocument();
    });
    expect(screen.queryByText("Unknown user")).not.toBeInTheDocument();
  });

  it("shows avatar image when avatarUrl exists", async () => {
    mockChannelAndMessages([
      {
        id: "m1",
        channelId: "ch1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: "/uploads/avatars/u2/test.png" },
        reactions: [],
      },
    ]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(document.querySelector("img[src='http://localhost:3001/uploads/avatars/u2/test.png']")).toBeInTheDocument();
    });
  });

  it("shows fallback initials when avatarUrl is null", async () => {
    mockChannelAndMessages([
      {
        id: "m1",
        channelId: "ch1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        reactions: [],
      },
    ]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("BO")).toBeInTheDocument();
    });
  });

  it("shows fallback initials from username when displayName and avatarUrl are null", async () => {
    mockChannelAndMessages([
      {
        id: "m1",
        channelId: "ch1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
        reactions: [],
      },
    ]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("BO")).toBeInTheDocument();
    });
  });

  it("keeps message content visible", async () => {
    mockChannelAndMessages([
      {
        id: "m1",
        channelId: "ch1",
        content: "Important message content",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        reactions: [],
      },
    ]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Important message content")).toBeInTheDocument();
    });
  });

  it("does not render spoken languages anywhere", async () => {
    mockChannelAndMessages([
      {
        id: "m1",
        channelId: "ch1",
        content: "Hello",
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        editedAt: null,
        author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        reactions: [],
      },
    ]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    expect(screen.queryByText(/English/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ukrainian/i)).not.toBeInTheDocument();
  });
});

describe("ChannelDetailPage — edit/delete", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
    window.alert = vi.fn();
  });

  const ownMessage = {
    id: "m1",
    channelId: "ch1",
    content: "Hello",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
    reactions: [],
  };

  const otherMessage = {
    id: "m2",
    channelId: "ch1",
    content: "Hi",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u2", username: "bob", displayName: null, avatarUrl: null },
    reactions: [],
  };

  it("shows Edit and Delete actions in menu for own message", async () => {
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    expect(screen.getByTestId("channel-edit-action-m1")).toBeInTheDocument();
    expect(screen.getByTestId("channel-delete-action-m1")).toBeInTheDocument();
  });

  it("hides Edit and Delete actions in menu for other user's message", async () => {
    mockChannelAndMessages([otherMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hi")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m2"));
    expect(screen.queryByTestId("channel-edit-action-m2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("channel-delete-action-m2")).not.toBeInTheDocument();
  });

  it("edits own message successfully", async () => {
    mockChannelAndMessages([ownMessage]);
    vi.mocked(updateMessage).mockResolvedValueOnce({
      ...ownMessage,
      content: "Updated",
      editedAt: "2024-01-02T00:00:00Z",
    });

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-edit-action-m1"));

    const editTextarea = screen.getByDisplayValue("Hello");
    await userEvent.clear(editTextarea);
    await userEvent.type(editTextarea, "Updated");

    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(updateMessage).toHaveBeenCalledWith("token", "ws1", "ch1", "m1", { content: "Updated" });
    });

    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save/i })).not.toBeInTheDocument();
  });

  it("shows validation error on empty edit", async () => {
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-edit-action-m1"));

    const editTextarea = screen.getByDisplayValue("Hello");
    await userEvent.clear(editTextarea);

    fireEvent.submit(screen.getByRole("button", { name: /Save/i }));

    expect(await screen.findByText(/Message cannot be empty/i)).toBeInTheDocument();
    expect(updateMessage).not.toHaveBeenCalled();
  });

  it("cancels edit without calling updateMessage", async () => {
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-edit-action-m1"));

    const editTextarea = screen.getByDisplayValue("Hello");
    await userEvent.type(editTextarea, "Changed");

    await userEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(updateMessage).not.toHaveBeenCalled();
  });

  it("deletes own message after confirm", async () => {
    mockChannelAndMessages([ownMessage]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteMessage).mockResolvedValueOnce(undefined);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-delete-action-m1"));

    await waitFor(() => {
      expect(deleteMessage).toHaveBeenCalledWith("token", "ws1", "ch1", "m1");
    });

    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
  });

  it("does not delete if user cancels confirm", async () => {
    mockChannelAndMessages([ownMessage]);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-delete-action-m1"));

    expect(deleteMessage).not.toHaveBeenCalled();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("shows alert and keeps message on delete backend failure", async () => {
    mockChannelAndMessages([ownMessage]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteMessage).mockRejectedValueOnce(new Error("Forbidden"));

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-delete-action-m1"));

    await waitFor(() => {
      expect(deleteMessage).toHaveBeenCalledWith("token", "ws1", "ch1", "m1");
    });

    expect(window.alert).toHaveBeenCalledWith("Forbidden");
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});

describe("ChannelDetailPage — message action locale", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
    window.alert = vi.fn();
  });

  const ownMessage = {
    id: "m1",
    channelId: "ch1",
    content: "Hello",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
    reactions: [],
  };

  it("shows Ukrainian Edit and Delete buttons", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    expect(screen.getByTestId("channel-edit-action-m1")).toBeInTheDocument();
    expect(screen.getByTestId("channel-delete-action-m1")).toBeInTheDocument();
  });

  it("shows Russian Edit and Delete buttons", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    expect(screen.getByTestId("channel-edit-action-m1")).toBeInTheDocument();
    expect(screen.getByTestId("channel-delete-action-m1")).toBeInTheDocument();
  });

  it("shows Ukrainian edited and reply labels", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockChannelAndMessages([
      {
        ...ownMessage,
        editedAt: "2024-01-02T00:00:00Z",
        parentId: "m0",
      },
    ]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    expect(screen.getByText("змінено")).toBeInTheDocument();
    expect(screen.getByText("Відповісти")).toBeInTheDocument();
  });

  it("shows Russian edited and reply labels", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([
      {
        ...ownMessage,
        editedAt: "2024-01-02T00:00:00Z",
        parentId: "m0",
      },
    ]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    expect(screen.getByText("изменено")).toBeInTheDocument();
    expect(screen.getByText("Ответить")).toBeInTheDocument();
  });

  it("shows Ukrainian Save and Cancel in edit mode", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-edit-action-m1"));

    expect(screen.getByRole("button", { name: /Зберегти/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Скасувати/i })).toBeInTheDocument();
  });

  it("shows Russian Save and Cancel in edit mode", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-edit-action-m1"));

    expect(screen.getByRole("button", { name: /Сохранить/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Отмена/i })).toBeInTheDocument();
  });

  it("calls confirm with Ukrainian delete message text", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockChannelAndMessages([ownMessage]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteMessage).mockResolvedValueOnce(undefined);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-delete-action-m1"));

    expect(confirmSpy).toHaveBeenCalledWith("Видалити це повідомлення?");
    confirmSpy.mockRestore();
  });

  it("calls confirm with Russian delete message text", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([ownMessage]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(deleteMessage).mockResolvedValueOnce(undefined);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-delete-action-m1"));

    expect(confirmSpy).toHaveBeenCalledWith("Удалить это сообщение?");
    confirmSpy.mockRestore();
  });
});

describe("ChannelDetailPage — WebSocket live events", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockClear();
    socketEmitMock.mockClear();
    socketDisconnectMock.mockClear();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  });

  const ownMessage = {
    id: "m1",
    channelId: "ch1",
    content: "Hello",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
    reactions: [],
  };

  it("updates message on message:updated", async () => {
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    expect(socketHandlers["message:updated"]).toBeDefined();
    act(() => {
      socketHandlers["message:updated"]({
        ...ownMessage,
        content: "Updated via WS",
        editedAt: "2024-01-02T00:00:00Z",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Updated via WS")).toBeInTheDocument();
    });
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
  });

  it("ignores message:updated from another channel", async () => {
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    act(() => {
      socketHandlers["message:updated"]({
        ...ownMessage,
        channelId: "ch-other",
        content: "Updated via WS",
        editedAt: "2024-01-02T00:00:00Z",
      });
    });

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.queryByText("Updated via WS")).not.toBeInTheDocument();
  });

  it("removes message on message:deleted", async () => {
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    expect(socketHandlers["message:deleted"]).toBeDefined();
    act(() => {
      socketHandlers["message:deleted"]({ id: "m1", channelId: "ch1", deletedAt: "2024-01-02T00:00:00Z" });
    });

    await waitFor(() => {
      expect(screen.queryByText("Hello")).not.toBeInTheDocument();
    });
  });

  it("ignores message:deleted from another channel", async () => {
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    act(() => {
      socketHandlers["message:deleted"]({ id: "m1", channelId: "ch-other", deletedAt: "2024-01-02T00:00:00Z" });
    });

    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("shows Ukrainian typing indicator for single user", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    expect(socketHandlers["typing:started"]).toBeDefined();
    act(() => {
      socketHandlers["typing:started"]({ channelId: "ch1", user: { id: "u2", username: "bob" } });
    });

    await waitFor(() => {
      expect(screen.getByText("пише…")).toBeInTheDocument();
    });
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("shows Russian typing indicator for multiple users", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    act(() => {
      socketHandlers["typing:started"]({ channelId: "ch1", user: { id: "u2", username: "bob" } });
    });
    act(() => {
      socketHandlers["typing:started"]({ channelId: "ch1", user: { id: "u3", username: "charlie" } });
    });

    await waitFor(() => {
      expect(screen.getByText("печатают…")).toBeInTheDocument();
    });
  });
});


describe("ChannelDetailPage — members", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  });

  async function openMembersDrawer() {
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Members|Учасники|Участники/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /Members|Учасники|Участники/i }));
  }

  const ownerMember: ChannelMember = {
    id: "cm1",
    channelId: "ch1",
    role: "OWNER",
    joinedAt: "2024-01-01T00:00:00Z",
    user: { id: "u1", username: "alice", displayName: "Alice" },
  };

  const adminMember: ChannelMember = {
    id: "cm2",
    channelId: "ch1",
    role: "ADMIN",
    joinedAt: "2024-01-01T00:00:00Z",
    user: { id: "u2", username: "bob", displayName: "Bob" },
  };

  const regularMember: ChannelMember = {
    id: "cm3",
    channelId: "ch1",
    role: "MEMBER",
    joinedAt: "2024-01-01T00:00:00Z",
    user: { id: "u1", username: "alice", displayName: "Alice" },
  };

  it("shows member list", async () => {
    mockChannelAndMessages([], [ownerMember, adminMember]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Owner", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Admin", { selector: "span" })).toBeInTheDocument();
  });

  it("shows displayName with @username when displayName is present", async () => {
    mockChannelAndMessages([], [ownerMember]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
  });

  it("falls back to @username when displayName is absent", async () => {
    const noDisplay: ChannelMember = {
      id: "cm5",
      channelId: "ch1",
      role: "MEMBER",
      joinedAt: "2024-01-01T00:00:00Z",
      user: { id: "u5", username: "dave" },
    };
    mockChannelAndMessages([], [noDisplay]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("dave")).toBeInTheDocument();
    });
    expect(screen.queryByText("Dave")).not.toBeInTheDocument();
  });

  it("shows avatar image when member avatarUrl exists", async () => {
    const memberWithAvatar: ChannelMember = {
      id: "cm1",
      channelId: "ch1",
      role: "OWNER",
      joinedAt: "2024-01-01T00:00:00Z",
      user: { id: "u1", username: "alice", displayName: "Alice", avatarUrl: "/uploads/avatars/u1/test.png" },
    };
    mockChannelAndMessages([], [memberWithAvatar]);
    const { container } = render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(container.querySelector("img")).toBeInTheDocument();
  });

  it("shows fallback initials when member avatarUrl is null", async () => {
    const memberWithoutAvatar: ChannelMember = {
      id: "cm1",
      channelId: "ch1",
      role: "OWNER",
      joinedAt: "2024-01-01T00:00:00Z",
      user: { id: "u1", username: "alice", displayName: "Alice", avatarUrl: null },
    };
    mockChannelAndMessages([], [memberWithoutAvatar]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("AL")).toBeInTheDocument();
    });
  });

  it("shows add member form for OWNER with role select", async () => {
    mockChannelAndMessages([], [ownerMember]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Add/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("MEMBER");
  });

  it("shows add member form for ADMIN, hides Archive button and role select", async () => {
    const adminAlice: ChannelMember = {
      id: "cm1",
      channelId: "ch1",
      role: "ADMIN",
      joinedAt: "2024-01-01T00:00:00Z",
      user: { id: "u1", username: "alice", displayName: "Alice" },
    };
    mockChannelAndMessages([], [adminAlice]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "general" })).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Archive/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("hides add member form for MEMBER", async () => {
    mockChannelAndMessages([], [regularMember]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText(/Username or email/i)).not.toBeInTheDocument();
  });

  it("MEMBER sees neither Archive nor Add member form", async () => {
    mockChannelAndMessages([], [regularMember]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "general" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Archive/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Username or email/i)).not.toBeInTheDocument();
  });

  it("shows archive button for OWNER", async () => {
    mockChannelAndMessages([], [ownerMember]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "general" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Archive/i })).toBeInTheDocument();
  });

  it("calls confirm with Ukrainian archive channel text", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockChannelAndMessages([], [ownerMember]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(archiveChannel).mockResolvedValueOnce({ success: true });

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Архівувати/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Архівувати/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Архівувати канал "general"?\nЦе приховає канал з робочого простору. Це може зробити лише власник каналу.'
    );
    confirmSpy.mockRestore();
  });

  it("MEMBER sees Leave channel button", async () => {
    mockChannelAndMessages([], [regularMember]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "general" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Leave channel/i })).toBeInTheDocument();
  });

  it("ADMIN sees Leave channel button", async () => {
    const adminAlice: ChannelMember = {
      id: "cm1",
      channelId: "ch1",
      role: "ADMIN",
      joinedAt: "2024-01-01T00:00:00Z",
      user: { id: "u1", username: "alice", displayName: "Alice" },
    };
    mockChannelAndMessages([], [adminAlice]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "general" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Leave channel/i })).toBeInTheDocument();
  });

  it("OWNER does not see Leave channel button", async () => {
    mockChannelAndMessages([], [ownerMember]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "general" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Leave channel/i })).not.toBeInTheDocument();
  });

  it("successful leave calls API, dispatches event, and redirects", async () => {
    routerPushMock.mockClear();
    vi.mocked(leaveChannel).mockResolvedValueOnce({ success: true });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    mockChannelAndMessages([], [regularMember]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Leave channel/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Leave channel/i }));

    await waitFor(() => {
      expect(leaveChannel).toHaveBeenCalledWith("token", "ws1", "ch1");
    });
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
    expect(routerPushMock).toHaveBeenCalledWith("/workspaces/ws1");

    confirmSpy.mockRestore();
    dispatchSpy.mockRestore();
  });

  it("calls confirm with Russian leave channel text", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([], [regularMember]);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(leaveChannel).mockResolvedValueOnce({ success: true });
    routerPushMock.mockClear();

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Покинуть канал/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Покинуть канал/i }));

    expect(confirmSpy).toHaveBeenCalledWith('Покинуть канал "general"?');
    confirmSpy.mockRestore();
  });

  it("cancel confirm does not call leaveChannel", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockChannelAndMessages([], [regularMember]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Leave channel/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Leave channel/i }));

    expect(leaveChannel).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("shows backend error on leave failure", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(leaveChannel).mockRejectedValueOnce(new Error("Owner cannot leave channel"));

    mockChannelAndMessages([], [regularMember]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Leave channel/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Leave channel/i }));

    expect(await screen.findByText(/Owner cannot leave channel/i)).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("sends channel invite for username input and does not append to members list", async () => {
    mockChannelAndMessages([], [ownerMember]);
    vi.mocked(createChannelInvite).mockResolvedValueOnce({
      id: "invite-1", workspaceId: "ws1", channelId: "ch1", email: "charlie@example.com", role: "MEMBER", token: "tok", expiresAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    });

    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "charlie");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));

    await waitFor(() => {
      expect(createChannelInvite).toHaveBeenCalledWith("token", "ws1", "ch1", { identifier: "charlie", role: "MEMBER" });
    });

    expect(addChannelMember).not.toHaveBeenCalled();
    expect(screen.getByText("Channel invitation sent")).toBeInTheDocument();
  });

  it("shows error on empty add member submit", async () => {
    mockChannelAndMessages([], [ownerMember]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole("button", { name: /Add/i }));

    expect(await screen.findByText(/Username or email is required/i)).toBeInTheDocument();
    expect(createChannelInvite).not.toHaveBeenCalled();
    expect(addChannelMember).not.toHaveBeenCalled();
  });

  it("shows backend error on invite failure", async () => {
    mockChannelAndMessages([], [ownerMember]);
    vi.mocked(createChannelInvite).mockRejectedValueOnce(new Error("Already a member of this channel"));

    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "bob");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));

    expect(await screen.findByText(/Already a member of this channel/i)).toBeInTheDocument();
  });

  it("OWNER selecting ADMIN sends role ADMIN via createChannelInvite", async () => {
    mockChannelAndMessages([], [ownerMember]);
    vi.mocked(createChannelInvite).mockResolvedValueOnce({
      id: "invite-1", workspaceId: "ws1", channelId: "ch1", email: "charlie@example.com", role: "ADMIN", token: "tok", expiresAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    });

    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "charlie");
    await userEvent.selectOptions(screen.getByRole("combobox"), "ADMIN");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));

    await waitFor(() => {
      expect(createChannelInvite).toHaveBeenCalledWith("token", "ws1", "ch1", { identifier: "charlie", role: "ADMIN" });
    });

    expect(screen.getByText("Channel invitation sent")).toBeInTheDocument();
  });

  it("ADMIN invite sends role MEMBER via createChannelInvite", async () => {
    const adminAlice: ChannelMember = {
      id: "cm1",
      channelId: "ch1",
      role: "ADMIN",
      joinedAt: "2024-01-01T00:00:00Z",
      user: { id: "u1", username: "alice", displayName: "Alice" },
    };
    mockChannelAndMessages([], [adminAlice]);
    vi.mocked(createChannelInvite).mockResolvedValueOnce({
      id: "invite-1", workspaceId: "ws1", channelId: "ch1", email: "charlie@example.com", role: "MEMBER", token: "tok", expiresAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    });

    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "charlie");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));

    await waitFor(() => {
      expect(createChannelInvite).toHaveBeenCalledWith("token", "ws1", "ch1", { identifier: "charlie", role: "MEMBER" });
    });

    expect(screen.getByText("Channel invitation sent")).toBeInTheDocument();
  });

  it("email input calls createChannelInvite with { email, role }", async () => {
    mockChannelAndMessages([], [ownerMember]);
    vi.mocked(createChannelInvite).mockResolvedValueOnce({
      id: "invite-1", workspaceId: "ws1", channelId: "ch1", email: "bob@example.com", role: "MEMBER", token: "tok", expiresAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    });

    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "bob@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));

    await waitFor(() => {
      expect(createChannelInvite).toHaveBeenCalledWith("token", "ws1", "ch1", { email: "bob@example.com", role: "MEMBER" });
    });
  });

  it("@username input calls createChannelInvite with identifier stripped of @", async () => {
    mockChannelAndMessages([], [ownerMember]);
    vi.mocked(createChannelInvite).mockResolvedValueOnce({
      id: "invite-1", workspaceId: "ws1", channelId: "ch1", email: "bob@example.com", role: "MEMBER", token: "tok", expiresAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    });

    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "@bob");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));

    await waitFor(() => {
      expect(createChannelInvite).toHaveBeenCalledWith("token", "ws1", "ch1", { identifier: "bob", role: "MEMBER" });
    });
  });

  it("shows backend error 'User must be a workspace member first' inline", async () => {
    mockChannelAndMessages([], [ownerMember]);
    vi.mocked(createChannelInvite).mockRejectedValueOnce(new Error("User must be a workspace member first"));

    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "unknown");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));

    expect(await screen.findByText(/User must be a workspace member first/i)).toBeInTheDocument();
  });
});


describe("ChannelDetailPage — remove member", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  });

  async function openMembersDrawer() {
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Members|Учасники|Участники/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /Members|Учасники|Участники/i }));
  }

  const ownerAlice: ChannelMember = {
    id: "cm1",
    channelId: "ch1",
    role: "OWNER",
    joinedAt: "2024-01-01T00:00:00Z",
    user: { id: "u1", username: "alice", displayName: "Alice" },
  };

  const adminBob: ChannelMember = {
    id: "cm2",
    channelId: "ch1",
    role: "ADMIN",
    joinedAt: "2024-01-01T00:00:00Z",
    user: { id: "u2", username: "bob", displayName: "Bob" },
  };

  const memberCharlie: ChannelMember = {
    id: "cm3",
    channelId: "ch1",
    role: "MEMBER",
    joinedAt: "2024-01-01T00:00:00Z",
    user: { id: "u3", username: "charlie", displayName: "Charlie" },
  };

  const regularMember: ChannelMember = {
    id: "cm4",
    channelId: "ch1",
    role: "MEMBER",
    joinedAt: "2024-01-01T00:00:00Z",
    user: { id: "u1", username: "alice", displayName: "Alice" },
  };

  it("OWNER sees Remove for MEMBER", async () => {
    mockChannelAndMessages([], [ownerAlice, memberCharlie]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });
    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    expect(removeButtons.length).toBe(1);
  });

  it("OWNER sees Remove for ADMIN", async () => {
    mockChannelAndMessages([], [ownerAlice, adminBob]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    expect(removeButtons.length).toBe(1);
  });

  it("OWNER does not see Remove for OWNER", async () => {
    mockChannelAndMessages([], [ownerAlice]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
  });

  it("ADMIN sees Remove for MEMBER", async () => {
    const adminAlice: ChannelMember = {
      id: "cm1",
      channelId: "ch1",
      role: "ADMIN",
      joinedAt: "2024-01-01T00:00:00Z",
      user: { id: "u1", username: "alice", displayName: "Alice" },
    };
    mockChannelAndMessages([], [adminAlice, memberCharlie]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });
    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    expect(removeButtons.length).toBe(1);
  });

  it("ADMIN does not see Remove for ADMIN", async () => {
    const adminAlice: ChannelMember = {
      id: "cm1",
      channelId: "ch1",
      role: "ADMIN",
      joinedAt: "2024-01-01T00:00:00Z",
      user: { id: "u1", username: "alice", displayName: "Alice" },
    };
    mockChannelAndMessages([], [adminAlice, adminBob]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
  });

  it("ADMIN does not see Remove for OWNER", async () => {
    const adminAlice: ChannelMember = {
      id: "cm1",
      channelId: "ch1",
      role: "ADMIN",
      joinedAt: "2024-01-01T00:00:00Z",
      user: { id: "u1", username: "alice", displayName: "Alice" },
    };
    const ownerDave: ChannelMember = {
      id: "cm5",
      channelId: "ch1",
      role: "OWNER",
      joinedAt: "2024-01-01T00:00:00Z",
      user: { id: "u5", username: "dave", displayName: "Dave" },
    };
    mockChannelAndMessages([], [adminAlice, ownerDave]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Dave")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
  });

  it("MEMBER sees no Remove buttons", async () => {
    mockChannelAndMessages([], [regularMember, memberCharlie]);
    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
  });

  it("successful remove calls API and removes user from list", async () => {
    mockChannelAndMessages([], [ownerAlice, memberCharlie]);
    vi.mocked(removeChannelMember).mockResolvedValueOnce({ success: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Remove/i }));

    await waitFor(() => {
      expect(removeChannelMember).toHaveBeenCalledWith("token", "ws1", "ch1", "cm3");
    });

    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
  });

  it("shows backend error on remove failure", async () => {
    mockChannelAndMessages([], [ownerAlice, memberCharlie]);
    vi.mocked(removeChannelMember).mockRejectedValueOnce(new Error("Member not found"));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Remove/i }));

    expect(await screen.findByText(/Member not found/i)).toBeInTheDocument();
  });

  it("cancel confirm does not call API", async () => {
    mockChannelAndMessages([], [ownerAlice, memberCharlie]);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ChannelDetailPage />);
    await openMembersDrawer();

    await waitFor(() => {
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Remove/i }));

    expect(removeChannelMember).not.toHaveBeenCalled();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });
});

describe("ChannelDetailPage — access lost redirect", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
  });

  it("redirects to workspace page when channel is not found", async () => {
    vi.mocked(getChannel).mockRejectedValueOnce(new Error("Channel not found"));
    vi.mocked(getMessages).mockRejectedValueOnce(new Error("Channel not found"));
    vi.mocked(getChannelMembers).mockRejectedValueOnce(new Error("Channel not found"));
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/workspaces/ws1");
    });
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
    dispatchSpy.mockRestore();
  });

  it("redirects to workspace page when workspace is not found", async () => {
    vi.mocked(getChannel).mockRejectedValueOnce(new Error("Workspace not found"));
    vi.mocked(getMessages).mockRejectedValueOnce(new Error("Workspace not found"));
    vi.mocked(getChannelMembers).mockRejectedValueOnce(new Error("Workspace not found"));
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/workspaces/ws1");
    });
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
    dispatchSpy.mockRestore();
  });

  it("redirects to workspace page on forbidden access", async () => {
    vi.mocked(getChannel).mockRejectedValueOnce(new Error("Forbidden"));
    vi.mocked(getMessages).mockRejectedValueOnce(new Error("Forbidden"));
    vi.mocked(getChannelMembers).mockRejectedValueOnce(new Error("Forbidden"));
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/workspaces/ws1");
    });
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
    dispatchSpy.mockRestore();
  });

  it("does not redirect on non-access channel errors", async () => {
    vi.mocked(getChannel).mockRejectedValueOnce(new Error("Network error"));
    vi.mocked(getMessages).mockRejectedValueOnce(new Error("Network error"));
    vi.mocked(getChannelMembers).mockRejectedValueOnce(new Error("Network error"));

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/Network error/i).length).toBeGreaterThan(0);
    });
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});

describe("ChannelDetailPage — socket access-loss handling", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockClear();
    socketEmitMock.mockClear();
    socketDisconnectMock.mockClear();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
    routerPushMock.mockClear();
  });

  const ownMessage = {
    id: "m1",
    channelId: "ch1",
    content: "Hello",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
    reactions: [],
  };

  it("channel:error 'Channel not found' dispatches channels:changed, disconnects, and redirects", async () => {
    mockChannelAndMessages([ownMessage]);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(socketHandlers["channel:error"]).toBeDefined();
    });

    act(() => {
      socketHandlers["channel:error"]({ message: "Channel not found" });
    });

    await waitFor(() => {
      expect(socketDisconnectMock).toHaveBeenCalled();
    });
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
    expect(routerPushMock).toHaveBeenCalledWith("/workspaces/ws1");
    dispatchSpy.mockRestore();
  });

  it("channel:error 'Forbidden' redirects to workspace", async () => {
    mockChannelAndMessages([ownMessage]);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(socketHandlers["channel:error"]).toBeDefined();
    });

    act(() => {
      socketHandlers["channel:error"]({ message: "Forbidden" });
    });

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/workspaces/ws1");
    });
    dispatchSpy.mockRestore();
  });

  it("channel:error 'Insufficient permissions' redirects to workspace", async () => {
    mockChannelAndMessages([ownMessage]);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(socketHandlers["channel:error"]).toBeDefined();
    });

    act(() => {
      socketHandlers["channel:error"]({ message: "Insufficient permissions" });
    });

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/workspaces/ws1");
    });
    dispatchSpy.mockRestore();
  });

  it("access-loss channel:error does not call console.error", async () => {
    mockChannelAndMessages([ownMessage]);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(socketHandlers["channel:error"]).toBeDefined();
    });

    act(() => {
      socketHandlers["channel:error"]({ message: "Channel not found" });
    });

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/workspaces/ws1");
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("unexpected channel:error still calls console.error", async () => {
    mockChannelAndMessages([ownMessage]);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(socketHandlers["channel:error"]).toBeDefined();
    });

    act(() => {
      socketHandlers["channel:error"]({ message: "Unknown socket failure" });
    });

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith("Channel error:", "Unknown socket failure");
    });
    expect(routerPushMock).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("auth:error disconnects socket without console.error", async () => {
    mockChannelAndMessages([ownMessage]);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(socketHandlers["auth:error"]).toBeDefined();
    });

    act(() => {
      socketHandlers["auth:error"]({ message: "Token invalid" });
    });

    await waitFor(() => {
      expect(socketDisconnectMock).toHaveBeenCalled();
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("auth:expired disconnects socket without console.error", async () => {
    mockChannelAndMessages([ownMessage]);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(socketHandlers["auth:expired"]).toBeDefined();
    });

    act(() => {
      socketHandlers["auth:expired"]();
    });

    await waitFor(() => {
      expect(socketDisconnectMock).toHaveBeenCalled();
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});


describe("ChannelDetailPage — message alignment", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  });

  const ownMessage = {
    id: "m1",
    channelId: "ch1",
    content: "Own message",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
    reactions: [],
  };

  const otherMessage = {
    id: "m2",
    channelId: "ch1",
    content: "Other message",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
    reactions: [],
  };

  it("renders own messages left-aligned", async () => {
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Own message")).toBeInTheDocument();
    });
    const row = screen.getByTestId("message-row-m1");
    expect(row).toHaveClass("items-start");
    expect(row).not.toHaveClass("ml-10");
    expect(screen.getByTestId("message-body-m1")).not.toHaveClass("ml-8");
    expect(screen.getByTestId("message-bubble-wrap-m1")).toHaveClass("ml-28");
    expect(screen.getByTestId("message-bubble-wrap-m1")).toHaveClass("sm:ml-44");
  });

  it("renders other user messages left-aligned", async () => {
    mockChannelAndMessages([otherMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Other message")).toBeInTheDocument();
    });
    const row = screen.getByTestId("message-row-m2");
    expect(row).not.toHaveClass("justify-end");
    expect(row).toHaveClass("items-start");
    expect(row).not.toHaveClass("ml-10");
    expect(screen.getByTestId("message-body-m2")).not.toHaveClass("ml-8");
    expect(screen.getByTestId("message-bubble-wrap-m2")).not.toHaveClass("ml-28");
    expect(screen.getByTestId("message-bubble-wrap-m2")).not.toHaveClass("sm:ml-44");
  });

  it("shows avatars for all messages", async () => {
    mockChannelAndMessages([otherMessage, ownMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Own message")).toBeInTheDocument();
    });
    expect(screen.getByTestId("message-row-m2")).toHaveClass("items-start");
    expect(screen.getByTestId("message-row-m2")).not.toHaveClass("ml-10");
    expect(screen.getByTestId("message-body-m2")).not.toHaveClass("ml-8");
    expect(screen.getByTestId("message-bubble-wrap-m2")).not.toHaveClass("ml-28");
    expect(screen.getByTestId("message-bubble-wrap-m2")).not.toHaveClass("sm:ml-44");
    expect(screen.getByTestId("message-row-m1")).toHaveClass("items-start");
    expect(screen.getByTestId("message-row-m1")).not.toHaveClass("ml-10");
    expect(screen.getByTestId("message-body-m1")).not.toHaveClass("ml-8");
    expect(screen.getByTestId("message-bubble-wrap-m1")).toHaveClass("ml-28");
    expect(screen.getByTestId("message-bubble-wrap-m1")).toHaveClass("sm:ml-44");
    expect(screen.getByTestId("message-avatar-m2")).toHaveClass("sticky");
    expect(screen.getByTestId("message-avatar-m2")).toHaveClass("bottom-3");
    expect(screen.getByTestId("message-avatar-m2")).toHaveClass("self-end");
    expect(screen.getByTestId("message-avatar-m1")).toHaveClass("sticky");
    expect(screen.getByTestId("message-avatar-m1")).toHaveClass("bottom-3");
    expect(screen.getByTestId("message-avatar-m1")).toHaveClass("self-end");
  });

  it("shows quoted preview inside own reply bubble", async () => {
    const parent = {
      id: "m0",
      channelId: "ch1",
      content: "Parent content",
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      reactions: [],
    };
    const ownReply = {
      id: "m3",
      channelId: "ch1",
      content: "Own reply",
      parentId: "m0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      reactions: [],
    };
    mockChannelAndMessages([parent, ownReply]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Own reply")).toBeInTheDocument();
    });
    expect(screen.getByTestId("message-row-m3")).toHaveClass("items-start");
    expect(screen.getAllByText("Parent content").length).toBe(2);
  });

  it("clicking quoted preview in own reply scrolls to parent", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    const parent = {
      id: "m0",
      channelId: "ch1",
      content: "Parent content",
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      reactions: [],
    };
    const ownReply = {
      id: "m3",
      channelId: "ch1",
      content: "Own reply",
      parentId: "m0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      reactions: [],
    };
    mockChannelAndMessages([parent, ownReply]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Own reply")).toBeInTheDocument();
    });
    const previews = screen.getAllByText("Parent content");
    await userEvent.click(previews[previews.length - 1]);
    expect(scrollIntoViewMock).toHaveBeenCalled();
    scrollIntoViewMock.mockRestore();
  });
});

describe("ChannelDetailPage — members drawer", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  });

  const ownerMember: ChannelMember = {
    id: "cm1",
    channelId: "ch1",
    role: "OWNER",
    joinedAt: "2024-01-01T00:00:00Z",
    user: { id: "u1", username: "alice", displayName: "Alice" },
  };

  const adminMember: ChannelMember = {
    id: "cm2",
    channelId: "ch1",
    role: "ADMIN",
    joinedAt: "2024-01-01T00:00:00Z",
    user: { id: "u2", username: "bob", displayName: "Bob" },
  };

  it("drawer is closed by default", async () => {
    mockChannelAndMessages([], [ownerMember, adminMember]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Members/i })).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText(/Search members/i)).not.toBeInTheDocument();
  });

  it("opens members drawer when Members button is clicked", async () => {
    mockChannelAndMessages([], [ownerMember, adminMember]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Members/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /Members/i }));
    expect(screen.getByPlaceholderText(/Search members/i)).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("closes members drawer when close button is clicked", async () => {
    mockChannelAndMessages([], [ownerMember, adminMember]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Members/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /Members/i }));
    expect(screen.getByPlaceholderText(/Search members/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.queryByPlaceholderText(/Search members/i)).not.toBeInTheDocument();
  });

  it("search filters members", async () => {
    mockChannelAndMessages([], [ownerMember, adminMember]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Members/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /Members/i }));
    await userEvent.type(screen.getByPlaceholderText(/Search members/i), "bob");
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows channel roles info and a link to workspace roles", async () => {
    mockChannelAndMessages([], [ownerMember]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Members/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /Members/i }));
    expect(
      screen.getByText(/Channel roles control who can manage this channel/i)
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Manage workspace roles/i });
    expect(link).toHaveAttribute("href", "/workspaces/ws1");
  });

  it("shows invite acceptance note when owner can add members", async () => {
    mockChannelAndMessages([], [ownerMember]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Members/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /Members/i }));
    expect(
      screen.getByText(/Invited users must accept before they appear here/i)
    ).toBeInTheDocument();
  });

  it("shows public channel note for public channels", async () => {
    mockChannelAndMessages([], [ownerMember]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Members/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /Members/i }));
    expect(
      screen.getByText(/Public channels are visible to all workspace members/i)
    ).toBeInTheDocument();
  });

  it("shows private channel note for private channels", async () => {
    vi.mocked(getChannel).mockResolvedValueOnce({
      id: "ch1",
      workspaceId: "ws1",
      name: "secret",
      slug: "secret",
      description: null,
      type: "PRIVATE",
      createdById: "u1",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      deletedAt: null,
    });
    vi.mocked(getMessages).mockResolvedValueOnce([]);
    vi.mocked(getChannelMembers).mockResolvedValueOnce([ownerMember]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Members/i })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /Members/i }));
    expect(
      screen.getByText(/Private channels are invitation-only/i)
    ).toBeInTheDocument();
  });
});

describe("ChannelDetailPage — replies", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  });

  const parentMessage = {
    id: "m1",
    channelId: "ch1",
    content: "Parent message content",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
    reactions: [],
  };

  const replyMessage = {
    id: "m2",
    channelId: "ch1",
    content: "This is a reply",
    parentId: "m1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
    reactions: [],
  };

  const ownStandaloneMessage = {
    id: "m3",
    channelId: "ch1",
    content: "Standalone",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
    reactions: [],
  };

  it("does not show inline Reply button on regular messages", async () => {
    mockChannelAndMessages([ownStandaloneMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Standalone")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Reply/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m3"));
    expect(screen.getByTestId("channel-reply-action-m3")).toBeInTheDocument();
  });



  it("shows quoted preview with author and snippet for loaded parent", async () => {
    mockChannelAndMessages([parentMessage, replyMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("This is a reply")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Bob").length).toBe(2);
    expect(screen.getAllByText("Parent message content").length).toBe(2);
  });

  it("shows fallback preview when parent is not loaded", async () => {
    mockChannelAndMessages([replyMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("This is a reply")).toBeInTheDocument();
    });
    expect(screen.getByText("Original message is not loaded")).toBeInTheDocument();
  });

  it("clicking Reply shows composer preview with author and snippet", async () => {
    mockChannelAndMessages([parentMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Parent message content")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-reply-action-m1"));
    expect(screen.getByText(/Replying to/i)).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getAllByText("Parent message content").length).toBe(2);
    expect(screen.getByRole("button", { name: /Cancel reply/i })).toBeInTheDocument();
  });

  it("cancel reply clears composer preview", async () => {
    mockChannelAndMessages([parentMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Parent message content")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-reply-action-m1"));
    expect(screen.getByText(/Replying to/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Cancel reply/i }));
    expect(screen.queryByText(/Replying to/i)).not.toBeInTheDocument();
  });

  it("sending a reply calls createMessage with parentId and clears preview", async () => {
    mockChannelAndMessages([parentMessage]);
    vi.mocked(createMessage).mockResolvedValueOnce({
      id: "m4",
      channelId: "ch1",
      content: "My reply",
      parentId: "m1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      reactions: [],
    });

    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Parent message content")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-reply-action-m1"));
    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "My reply");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(createMessage).toHaveBeenCalledWith("token", "ws1", "ch1", {
        content: "My reply",
        parentId: "m1",
      });
    });
    expect(screen.queryByText(/Replying to/i)).not.toBeInTheDocument();
  });

  it("preserves reply target on send failure", async () => {
    mockChannelAndMessages([parentMessage]);
    vi.mocked(createMessage).mockRejectedValueOnce(new Error("Forbidden"));

    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Parent message content")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-reply-action-m1"));
    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "My reply");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    expect(await screen.findByText(/Forbidden/i)).toBeInTheDocument();
    expect(screen.getByText(/Replying to/i)).toBeInTheDocument();
  });

  it("clicking quoted preview scrolls to parent message", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    mockChannelAndMessages([parentMessage, replyMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("This is a reply")).toBeInTheDocument();
    });
    const previews = screen.getAllByText("Parent message content");
    await userEvent.click(previews[previews.length - 1]);
    expect(scrollIntoViewMock).toHaveBeenCalled();
    scrollIntoViewMock.mockRestore();
  });
});


describe("ChannelDetailPage — reactions", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
    vi.mocked(addMessageReaction).mockReset();
    vi.mocked(removeMessageReaction).mockReset();
    window.alert = vi.fn();
  });

  const messageWithNoReactions = {
    id: "m1",
    channelId: "ch1",
    content: "Hello",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
    reactions: [],
  };

  const messageWithReaction = {
    id: "m2",
    channelId: "ch1",
    content: "World",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
    reactions: [{ emoji: "👍", count: 2, reactedByMe: false }],
  };

  const ownMessageWithReaction = {
    id: "m3",
    channelId: "ch1",
    content: "Own msg",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
    reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
  };

  it("hides reaction picker by default", async () => {
    mockChannelAndMessages([messageWithNoReactions]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("channel-reaction-picker-m1")).not.toBeInTheDocument();
  });

  it("opens fixed message menu on trigger click", async () => {
    mockChannelAndMessages([messageWithNoReactions]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    expect(screen.getByTestId("channel-message-menu-m1")).toBeInTheDocument();
    expect(screen.getByTestId("channel-message-menu-m1")).toHaveClass("fixed");
  });

  it("clamps menu position near viewport bottom", async () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 300,
    });
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = vi.fn(
      () =>
        ({
          top: 200,
          left: 100,
          right: 130,
          bottom: 230,
          width: 30,
          height: 30,
          x: 100,
          y: 200,
          toJSON: () => {},
        }) as unknown as DOMRect,
    );

    mockChannelAndMessages([messageWithNoReactions]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));

    const menu = screen.getByTestId("channel-message-menu-m1");
    expect(parseInt(menu.style.top, 10)).toBe(108);

    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it("opens message menu on right-click", async () => {
    mockChannelAndMessages([messageWithNoReactions]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    fireEvent.contextMenu(screen.getByTestId("message-bubble-m1"));
    expect(screen.getByTestId("channel-message-menu-m1")).toBeInTheDocument();
  });

  it("opens reaction picker from menu React action", async () => {
    mockChannelAndMessages([messageWithNoReactions]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-react-action-m1"));
    expect(screen.getByTestId("channel-reaction-picker-m1")).toBeInTheDocument();
    expect(screen.queryByTestId("channel-message-menu-m1")).not.toBeInTheDocument();
  });

  it("positions reaction picker fixed and within viewport", async () => {
    mockChannelAndMessages([messageWithNoReactions]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-react-action-m1"));
    const picker = screen.getByTestId("channel-reaction-picker-m1");
    expect(picker).toHaveClass("fixed");
    const left = parseInt(picker.style.left, 10);
    const top = parseInt(picker.style.top, 10);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left).toBeLessThanOrEqual(window.innerWidth);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(window.innerHeight);
  });

  it("closes picker after selecting emoji", async () => {
    vi.mocked(addMessageReaction).mockResolvedValueOnce([
      { emoji: "👍", count: 1, reactedByMe: true },
    ]);
    mockChannelAndMessages([messageWithNoReactions]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-react-action-m1"));
    expect(screen.getByTestId("channel-reaction-picker-m1")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("channel-reaction-option-m1-👍"));
    await waitFor(() => {
      expect(screen.queryByTestId("channel-reaction-picker-m1")).not.toBeInTheDocument();
    });
  });

  it("closes menu and picker on scroll", async () => {
    mockChannelAndMessages([messageWithNoReactions]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    expect(screen.getByTestId("channel-message-menu-m1")).toBeInTheDocument();

    const scrollContainer = screen.getByText("Hello").closest(".overflow-y-auto");
    if (scrollContainer) {
      fireEvent.scroll(scrollContainer);
    }

    await waitFor(() => {
      expect(screen.queryByTestId("channel-message-menu-m1")).not.toBeInTheDocument();
    });
  });

  it("closes menu and picker on outside click", async () => {
    mockChannelAndMessages([messageWithNoReactions]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    expect(screen.getByTestId("channel-message-menu-m1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("heading", { name: "general" }));

    await waitFor(() => {
      expect(screen.queryByTestId("channel-message-menu-m1")).not.toBeInTheDocument();
    });
  });

  it("closes menu and picker on Escape key", async () => {
    mockChannelAndMessages([messageWithNoReactions]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    expect(screen.getByTestId("channel-message-menu-m1")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("channel-message-menu-m1")).not.toBeInTheDocument();
    });
  });

  it("socket reaction:added from other user updates count without changing my reactedByMe", async () => {
    mockChannelAndMessages([messageWithReaction]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("World")).toBeInTheDocument();
    });
    expect(screen.getByTestId("channel-reaction-chip-m2-👍")).toBeInTheDocument();

    act(() => {
      socketHandlers["reaction:added"]({
        messageId: "m2",
        channelId: "ch1",
        emoji: "👍",
        user: { id: "u3", username: "charlie" },
        reactions: [{ emoji: "👍", count: 3 }],
      });
    });

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });
    const chip = screen.getByTestId("channel-reaction-chip-m2-👍");
    expect(chip).not.toHaveClass("bg-primary/10");
  });

  it("socket reaction:added from self sets reactedByMe true", async () => {
    mockChannelAndMessages([messageWithNoReactions]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("channel-reactions-m1")).not.toBeInTheDocument();

    act(() => {
      socketHandlers["reaction:added"]({
        messageId: "m1",
        channelId: "ch1",
        emoji: "❤️",
        user: { id: "u1", username: "alice" },
        reactions: [{ emoji: "❤️", count: 1, reactedByMe: true }],
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("channel-reaction-chip-m1-❤️")).toBeInTheDocument();
    });
    const chip = screen.getByTestId("channel-reaction-chip-m1-❤️");
    expect(chip).toHaveClass("bg-primary/10");
  });

  it("replacing own emoji removes old reaction chip and shows new one active", async () => {
    mockChannelAndMessages([ownMessageWithReaction]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Own msg")).toBeInTheDocument();
    });
    expect(screen.getByTestId("channel-reaction-chip-m3-👍")).toBeInTheDocument();

    act(() => {
      socketHandlers["reaction:added"]({
        messageId: "m3",
        channelId: "ch1",
        emoji: "🔥",
        user: { id: "u1", username: "alice" },
        reactions: [{ emoji: "🔥", count: 1, reactedByMe: true }],
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("channel-reaction-chip-m3-👍")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("channel-reaction-chip-m3-🔥")).toBeInTheDocument();
    expect(screen.getByTestId("channel-reaction-chip-m3-🔥")).toHaveClass("bg-primary/10");
  });

  it("reaction socket event does not duplicate messages", async () => {
    mockChannelAndMessages([messageWithNoReactions, messageWithReaction]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId(/^message-row-/).length).toBe(2);

    act(() => {
      socketHandlers["reaction:added"]({
        messageId: "m1",
        channelId: "ch1",
        emoji: "👍",
        user: { id: "u2", username: "bob" },
        reactions: [{ emoji: "👍", count: 1 }],
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("channel-reaction-chip-m1-👍")).toBeInTheDocument();
    });
    expect(screen.getAllByTestId(/^message-row-/).length).toBe(2);
  });

  it("send message still works with reactions present", async () => {
    vi.mocked(createMessage).mockResolvedValueOnce({
      id: "m4",
      channelId: "ch1",
      content: "New msg",
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      reactions: [],
    });
    mockChannelAndMessages([messageWithNoReactions]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "New msg");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(createMessage).toHaveBeenCalledWith("token", "ws1", "ch1", { content: "New msg" });
    });
    expect(screen.getByText("New msg")).toBeInTheDocument();
  });

  it("reply still works with reactions present", async () => {
    const parent = {
      id: "m1",
      channelId: "ch1",
      content: "Parent",
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      author: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
      reactions: [],
    };
    vi.mocked(createMessage).mockResolvedValueOnce({
      id: "m4",
      channelId: "ch1",
      content: "Reply text",
      parentId: "m1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      reactions: [],
    });
    mockChannelAndMessages([parent]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Parent")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-reply-action-m1"));
    await userEvent.type(screen.getByPlaceholderText(/Type a message/i), "Reply text");
    await userEvent.click(screen.getByRole("button", { name: /Send/i }));

    await waitFor(() => {
      expect(createMessage).toHaveBeenCalledWith("token", "ws1", "ch1", {
        content: "Reply text",
        parentId: "m1",
      });
    });
  });

  it("edit and delete still work with reactions present", async () => {
    const ownMsg = {
      id: "m1",
      channelId: "ch1",
      content: "Editable",
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      reactions: [{ emoji: "👍", count: 1, reactedByMe: true }],
    };
    vi.mocked(updateMessage).mockResolvedValueOnce({
      ...ownMsg,
      content: "Updated",
      editedAt: "2024-01-02T00:00:00Z",
    });
    vi.mocked(deleteMessage).mockResolvedValueOnce(undefined);

    mockChannelAndMessages([ownMsg]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Editable")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-edit-action-m1"));
    const editTextarea = screen.getByDisplayValue("Editable");
    await userEvent.clear(editTextarea);
    await userEvent.type(editTextarea, "Updated");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => {
      expect(updateMessage).toHaveBeenCalledWith("token", "ws1", "ch1", "m1", { content: "Updated" });
    });
    expect(screen.getByText("Updated")).toBeInTheDocument();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-delete-action-m1"));
    await waitFor(() => {
      expect(deleteMessage).toHaveBeenCalledWith("token", "ws1", "ch1", "m1");
    });
    expect(screen.queryByText("Updated")).not.toBeInTheDocument();
  });
});

describe("ChannelDetailPage — forward", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
    window.alert = vi.fn();
  });

  const ownMessage = {
    id: "m1",
    channelId: "ch1",
    content: "Hello",
    parentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editedAt: null,
    author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
    reactions: [],
  };

  it("shows Forward action in message menu", async () => {
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    expect(screen.getByTestId("channel-forward-action-m1")).toBeInTheDocument();
  });

  it("opens forward modal and sends message to selected conversation", async () => {
    mockChannelAndMessages([ownMessage]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([
      {
        id: "dc1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        otherParticipant: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        lastMessage: null,
        unreadCount: 0,
        isOnline: false,
      },
    ]);
    vi.mocked(sendDirectMessage).mockResolvedValueOnce({
      id: "dm1",
      conversationId: "dc1",
      content: "↪ Hello",
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editedAt: null,
      author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
      parent: null,
      reactions: [],
      readByOtherParticipant: false,
      isUnreadForMe: false,
    });

    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-forward-action-m1"));

    await waitFor(() => {
      expect(screen.getByText("Forward to")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Bob"));

    await waitFor(() => {
      expect(sendDirectMessage).toHaveBeenCalledWith("token", "dc1", { content: "↪ Hello" });
    });
    expect(screen.queryByText("Forward to")).not.toBeInTheDocument();
  });

  it("shows error when loading conversations fails", async () => {
    mockChannelAndMessages([ownMessage]);
    vi.mocked(listDirectConversations).mockRejectedValueOnce(new Error("Network error"));

    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-forward-action-m1"));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows 'no conversations' when list is empty", async () => {
    mockChannelAndMessages([ownMessage]);
    vi.mocked(listDirectConversations).mockResolvedValueOnce([]);

    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("channel-message-menu-trigger-m1"));
    await userEvent.click(screen.getByTestId("channel-forward-action-m1"));

    await waitFor(() => {
      expect(screen.getByText("No direct conversations yet.")).toBeInTheDocument();
    });
  });

  describe("attachments", () => {
    afterEach(() => {
      vi.mocked(getAttachmentDownloadUrl).mockReset();
      vi.mocked(getAttachmentDownloadUrl).mockResolvedValue({
        downloadUrl: "http://minio/img",
        expiresInSeconds: 300,
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        kind: "image",
        createdAt: "2024-01-01T00:00:00Z",
      });
    });
    const ownMessageWithAttachment: Message = {
      ...ownMessage,
      attachments: [
        {
          id: "a1",
          fileName: "doc.pdf",
          mimeType: "application/pdf",
          sizeBytes: 5678,
          kind: "file",
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
    };

    it("renders attachment button and hidden file input", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });
      expect(screen.getByTestId("composer-file-input")).toBeInTheDocument();
    });

    it("selecting valid file shows file chip", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "test.txt", { type: "text/plain" });
      const input = screen.getByTestId("composer-file-input") as HTMLInputElement;
      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByTestId("composer-attachment-chip-0")).toBeInTheDocument();
      });
      expect(screen.getByText("test.txt")).toBeInTheDocument();
    });

    it("shows error for invalid MIME and does not add file", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "evil.exe", { type: "application/x-msdownload" });
      const input = screen.getByTestId("composer-file-input") as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText("Invalid file type")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("composer-attachment-chip-0")).not.toBeInTheDocument();
    });

    it("shows error for oversized file and does not add file", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File([new Uint8Array(11 * 1024 * 1024)], "huge.png", { type: "image/png" });
      const input = screen.getByTestId("composer-file-input") as HTMLInputElement;
      await userEvent.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText("File exceeds 10 MB")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("composer-attachment-chip-0")).not.toBeInTheDocument();
    });

    it("rejects more than 5 files", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const files = Array.from({ length: 6 }, (_, i) => new File(["c"], `f${i}.txt`, { type: "text/plain" }));
      const input = screen.getByTestId("composer-file-input") as HTMLInputElement;
      await userEvent.upload(input, files);

      await waitFor(() => {
        expect(screen.getByText("Maximum 5 attachments allowed")).toBeInTheDocument();
      });
    });

    it("sends text + attachment: calls presign, upload, create message, clears files", async () => {
      mockChannelAndMessages([], []);
      vi.mocked(presignAttachmentUpload).mockResolvedValueOnce({
        uploadUrl: "http://minio/upload",
        storageKey: "attachments/u1/uuid-file.txt",
        fileName: "test.txt",
        mimeType: "text/plain",
        sizeBytes: 7,
        kind: "file",
        expiresInSeconds: 300,
      });
      vi.mocked(uploadAttachmentToPresignedUrlWithProgress).mockResolvedValueOnce(undefined);
      const createdMsg: Message = {
        id: "m2",
        channelId: "ch1",
        content: "hello with file",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        reactions: [],
        attachments: [
          {
            id: "a1",
            fileName: "test.txt",
            mimeType: "text/plain",
            sizeBytes: 7,
            kind: "file",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      vi.mocked(createMessage).mockResolvedValueOnce(createdMsg);

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "test.txt", { type: "text/plain" });
      await userEvent.upload(screen.getByTestId("composer-file-input"), file);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attachment-chip-0")).toBeInTheDocument();
      });

      const textarea = screen.getByPlaceholderText("Type a message…");
      await userEvent.type(textarea, "hello with file");
      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => {
        expect(presignAttachmentUpload).toHaveBeenCalledWith("token", "ws1", "ch1", {
          filename: "test.txt",
          mimeType: "text/plain",
          sizeBytes: 7,
        });
      });
      expect(uploadAttachmentToPresignedUrlWithProgress).toHaveBeenCalledWith("http://minio/upload", expect.any(File), expect.any(Function));
      expect(createMessage).toHaveBeenCalledWith("token", "ws1", "ch1", expect.objectContaining({
        content: "hello with file",
        attachments: expect.arrayContaining([
          expect.objectContaining({ storageKey: "attachments/u1/uuid-file.txt", fileName: "test.txt" }),
        ]),
      }));
      await waitFor(() => {
        expect(screen.getByText("hello with file")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("composer-attachment-chip-0")).not.toBeInTheDocument();
    });

    it("upload failure shows error and does not call createMessage", async () => {
      mockChannelAndMessages([], []);
      vi.mocked(presignAttachmentUpload).mockResolvedValueOnce({
        uploadUrl: "http://minio/upload",
        storageKey: "attachments/u1/uuid-file.txt",
        fileName: "test.txt",
        mimeType: "text/plain",
        sizeBytes: 7,
        kind: "file",
        expiresInSeconds: 300,
      });
      vi.mocked(uploadAttachmentToPresignedUrlWithProgress).mockRejectedValueOnce(new Error("Upload failed: 403 Forbidden"));

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "test.txt", { type: "text/plain" });
      await userEvent.upload(screen.getByTestId("composer-file-input"), file);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attachment-chip-0")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => {
        expect(screen.getByText("Attachment upload failed. Please try again.")).toBeInTheDocument();
      });
      expect(screen.getByText("Upload failed")).toBeInTheDocument();
      expect(createMessage).not.toHaveBeenCalled();
      expect(screen.getByTestId("composer-attachment-chip-0")).toBeInTheDocument();
    });

    it("sends attachments-only message", async () => {
      mockChannelAndMessages([], []);
      vi.mocked(presignAttachmentUpload).mockResolvedValueOnce({
        uploadUrl: "http://minio/upload",
        storageKey: "attachments/u1/uuid-file.txt",
        fileName: "test.txt",
        mimeType: "text/plain",
        sizeBytes: 7,
        kind: "file",
        expiresInSeconds: 300,
      });
      vi.mocked(uploadAttachmentToPresignedUrlWithProgress).mockResolvedValueOnce(undefined);
      const createdMsg: Message = {
        id: "m2",
        channelId: "ch1",
        content: "",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        reactions: [],
        attachments: [
          {
            id: "a1",
            fileName: "test.txt",
            mimeType: "text/plain",
            sizeBytes: 7,
            kind: "file",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      vi.mocked(createMessage).mockResolvedValueOnce(createdMsg);

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "test.txt", { type: "text/plain" });
      await userEvent.upload(screen.getByTestId("composer-file-input"), file);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attachment-chip-0")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => {
        expect(createMessage).toHaveBeenCalledWith("token", "ws1", "ch1", expect.objectContaining({
          attachments: expect.any(Array),
        }));
      });
      expect(screen.queryByTestId("composer-attachment-chip-0")).not.toBeInTheDocument();
    });

    it("renders attachment metadata in message item", async () => {
      mockChannelAndMessages([ownMessageWithAttachment], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachments-m1")).toBeInTheDocument();
      });
      expect(screen.getByText("doc.pdf")).toBeInTheDocument();
      expect(screen.getByText("5.5 KB")).toBeInTheDocument();
    });

    it("clicking attachment calls download-url API and opens URL", async () => {
      mockChannelAndMessages([ownMessageWithAttachment], []);
      vi.mocked(getAttachmentDownloadUrl).mockResolvedValueOnce({
        downloadUrl: "http://minio/download",
        expiresInSeconds: 300,
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        sizeBytes: 5678,
        kind: "file",
        createdAt: "2024-01-01T00:00:00Z",
      });
      const openMock = vi.spyOn(window, "open").mockImplementation(() => null);

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachments-m1")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("message-attachment-m1-a1"));

      await waitFor(() => {
        expect(getAttachmentDownloadUrl).toHaveBeenCalledWith("token", "ws1", "ch1", "m1", "a1");
      });
      expect(openMock).toHaveBeenCalledWith("http://minio/download", "_blank");
      openMock.mockRestore();
    });

    it("selecting image file shows thumbnail preview", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "test.png", { type: "image/png" });
      await userEvent.upload(screen.getByTestId("composer-file-input"), file);

      await waitFor(() => {
        expect(screen.getByTestId("composer-attachment-preview-0")).toBeInTheDocument();
      });
      expect(screen.getByAltText("test.png")).toBeInTheDocument();
      expect(screen.queryByTestId("composer-attachment-chip-0")).not.toBeInTheDocument();
    });

    it("removing selected image revokes preview", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "test.png", { type: "image/png" });
      await userEvent.upload(screen.getByTestId("composer-file-input"), file);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attachment-preview-0")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("composer-attachment-remove-0"));

      await waitFor(() => {
        expect(screen.queryByTestId("composer-attachment-preview-0")).not.toBeInTheDocument();
      });
    });

    it("selecting text file shows file card, not image thumbnail", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "notes.txt", { type: "text/plain" });
      await userEvent.upload(screen.getByTestId("composer-file-input"), file);

      await waitFor(() => {
        expect(screen.getByTestId("composer-attachment-chip-0")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("composer-attachment-preview-0")).not.toBeInTheDocument();
    });

    it("drag-over shows visual drag state", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const form = screen.getByTestId("composer-attach-button").closest("form")!;
      fireEvent.dragEnter(form, { dataTransfer: { types: ["Files"] } });

      await waitFor(() => {
        expect(screen.getByTestId("composer-drag-overlay")).toBeInTheDocument();
      });

      fireEvent.dragLeave(form);

      await waitFor(() => {
        expect(screen.queryByTestId("composer-drag-overlay")).not.toBeInTheDocument();
      });
    });

    it("dropping valid image adds preview", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "drop.png", { type: "image/png" });
      const form = screen.getByTestId("composer-attach-button").closest("form")!;
      fireEvent.drop(form, { dataTransfer: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId("composer-attachment-preview-0")).toBeInTheDocument();
      });
    });

    it("dropping invalid MIME shows error", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "evil.exe", { type: "application/x-msdownload" });
      const form = screen.getByTestId("composer-attach-button").closest("form")!;
      fireEvent.drop(form, { dataTransfer: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByText("Invalid file type")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("composer-attachment-chip-0")).not.toBeInTheDocument();
      expect(screen.queryByTestId("composer-attachment-preview-0")).not.toBeInTheDocument();
    });

    it("dropping more than 5 files rejects extras and shows error", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const files = Array.from({ length: 6 }, (_, i) => new File(["c"], `f${i}.txt`, { type: "text/plain" }));
      const form = screen.getByTestId("composer-attach-button").closest("form")!;
      fireEvent.drop(form, { dataTransfer: { files } });

      await waitFor(() => {
        expect(screen.getByText("Maximum 5 attachments allowed")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("composer-attachment-chip-0")).not.toBeInTheDocument();
    });

    it("dropping mixed valid and invalid files adds valid and shows error", async () => {
      mockChannelAndMessages([], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const validFile = new File(["c"], "valid.txt", { type: "text/plain" });
      const invalidFile = new File(["c"], "evil.exe", { type: "application/x-msdownload" });
      const form = screen.getByTestId("composer-attach-button").closest("form")!;
      fireEvent.drop(form, { dataTransfer: { files: [validFile, invalidFile] } });

      await waitFor(() => {
        expect(screen.getByTestId("composer-attachment-chip-0")).toBeInTheDocument();
      });
      expect(screen.getByText("valid.txt")).toBeInTheDocument();
      expect(screen.getByText("Some files were invalid and not added")).toBeInTheDocument();
      expect(screen.queryByTestId("composer-attachment-chip-1")).not.toBeInTheDocument();
    });

    it("sending image attachment calls presign, upload, create message", async () => {
      mockChannelAndMessages([], []);
      vi.mocked(presignAttachmentUpload).mockResolvedValueOnce({
        uploadUrl: "http://minio/upload",
        storageKey: "attachments/u1/uuid-img.png",
        fileName: "test.png",
        mimeType: "image/png",
        sizeBytes: 7,
        kind: "image",
        expiresInSeconds: 300,
      });
      vi.mocked(uploadAttachmentToPresignedUrlWithProgress).mockResolvedValueOnce(undefined);
      vi.mocked(getAttachmentDownloadUrl).mockResolvedValue({
        downloadUrl: "http://minio/img",
        expiresInSeconds: 300,
        fileName: "test.png",
        mimeType: "image/png",
        sizeBytes: 7,
        kind: "image",
        createdAt: "2024-01-01T00:00:00Z",
      });
      const createdMsg: Message = {
        id: "m2",
        channelId: "ch1",
        content: "",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        reactions: [],
        attachments: [
          {
            id: "a2",
            fileName: "test.png",
            mimeType: "image/png",
            sizeBytes: 7,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      vi.mocked(createMessage).mockResolvedValueOnce(createdMsg);

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "test.png", { type: "image/png" });
      await userEvent.upload(screen.getByTestId("composer-file-input"), file);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attachment-preview-0")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => {
        expect(presignAttachmentUpload).toHaveBeenCalledWith("token", "ws1", "ch1", {
          filename: "test.png",
          mimeType: "image/png",
          sizeBytes: 7,
        });
      });
      expect(uploadAttachmentToPresignedUrlWithProgress).toHaveBeenCalledWith("http://minio/upload", expect.any(File), expect.any(Function));
      expect(createMessage).toHaveBeenCalledWith("token", "ws1", "ch1", expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ storageKey: "attachments/u1/uuid-img.png", fileName: "test.png" }),
        ]),
      }));
      await waitFor(() => {
        expect(screen.queryByTestId("composer-attachment-preview-0")).not.toBeInTheDocument();
      });
    });

    it("renders image attachment inline preview in message item", async () => {
      const msgWithImage: Message = {
        ...ownMessage,
        content: "",
        attachments: [
          {
            id: "a2",
            fileName: "photo.png",
            mimeType: "image/png",
            sizeBytes: 1234,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      mockChannelAndMessages([msgWithImage], []);
      vi.mocked(getAttachmentDownloadUrl).mockResolvedValueOnce({
        downloadUrl: "http://minio/img",
        expiresInSeconds: 300,
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        kind: "image",
        createdAt: "2024-01-01T00:00:00Z",
      });

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachments-m1")).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.getByTestId("message-attachment-image-m1-a2")).toBeInTheDocument();
      });
      expect(screen.getByAltText("photo.png")).toBeInTheDocument();
    });

    it("clicking image attachment opens lightbox", async () => {
      const msgWithImage: Message = {
        ...ownMessage,
        content: "",
        attachments: [
          {
            id: "a2",
            fileName: "photo.png",
            mimeType: "image/png",
            sizeBytes: 1234,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      mockChannelAndMessages([msgWithImage], []);
      vi.mocked(getAttachmentDownloadUrl).mockResolvedValueOnce({
        downloadUrl: "http://minio/img",
        expiresInSeconds: 300,
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        kind: "image",
        createdAt: "2024-01-01T00:00:00Z",
      });

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachment-image-m1-a2")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("message-attachment-image-m1-a2"));

      await waitFor(() => {
        expect(screen.getByTestId("image-lightbox")).toBeInTheDocument();
      });
      expect(screen.getByTestId("lightbox-image")).toHaveAttribute("src", "http://minio/img");
    });

    it("lightbox close button closes it", async () => {
      const msgWithImage: Message = {
        ...ownMessage,
        content: "",
        attachments: [
          {
            id: "a2",
            fileName: "photo.png",
            mimeType: "image/png",
            sizeBytes: 1234,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      mockChannelAndMessages([msgWithImage], []);
      vi.mocked(getAttachmentDownloadUrl).mockResolvedValueOnce({
        downloadUrl: "http://minio/img",
        expiresInSeconds: 300,
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        kind: "image",
        createdAt: "2024-01-01T00:00:00Z",
      });

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachment-image-m1-a2")).toBeInTheDocument();
      });
      await userEvent.click(screen.getByTestId("message-attachment-image-m1-a2"));
      await waitFor(() => {
        expect(screen.getByTestId("image-lightbox")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("lightbox-close"));

      await waitFor(() => {
        expect(screen.queryByTestId("image-lightbox")).not.toBeInTheDocument();
      });
    });

    it("lightbox closes on Escape key", async () => {
      const msgWithImage: Message = {
        ...ownMessage,
        content: "",
        attachments: [
          {
            id: "a2",
            fileName: "photo.png",
            mimeType: "image/png",
            sizeBytes: 1234,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      mockChannelAndMessages([msgWithImage], []);
      vi.mocked(getAttachmentDownloadUrl).mockResolvedValueOnce({
        downloadUrl: "http://minio/img",
        expiresInSeconds: 300,
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        kind: "image",
        createdAt: "2024-01-01T00:00:00Z",
      });

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachment-image-m1-a2")).toBeInTheDocument();
      });
      await userEvent.click(screen.getByTestId("message-attachment-image-m1-a2"));
      await waitFor(() => {
        expect(screen.getByTestId("image-lightbox")).toBeInTheDocument();
      });

      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByTestId("image-lightbox")).not.toBeInTheDocument();
      });
    });

    it("lightbox closes on backdrop click", async () => {
      const msgWithImage: Message = {
        ...ownMessage,
        content: "",
        attachments: [
          {
            id: "a2",
            fileName: "photo.png",
            mimeType: "image/png",
            sizeBytes: 1234,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      mockChannelAndMessages([msgWithImage], []);
      vi.mocked(getAttachmentDownloadUrl).mockResolvedValueOnce({
        downloadUrl: "http://minio/img",
        expiresInSeconds: 300,
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        kind: "image",
        createdAt: "2024-01-01T00:00:00Z",
      });

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachment-image-m1-a2")).toBeInTheDocument();
      });
      await userEvent.click(screen.getByTestId("message-attachment-image-m1-a2"));
      await waitFor(() => {
        expect(screen.getByTestId("image-lightbox")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("image-lightbox"));

      await waitFor(() => {
        expect(screen.queryByTestId("image-lightbox")).not.toBeInTheDocument();
      });
    });

    it("lightbox shows counter and navigation for multiple images", async () => {
      const msgWithImages: Message = {
        ...ownMessage,
        content: "",
        attachments: [
          {
            id: "a1",
            fileName: "one.png",
            mimeType: "image/png",
            sizeBytes: 100,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
          {
            id: "a2",
            fileName: "two.png",
            mimeType: "image/png",
            sizeBytes: 200,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      mockChannelAndMessages([msgWithImages], []);
      vi.mocked(getAttachmentDownloadUrl).mockImplementation(async (_t, _w, _c, _m, attachmentId) => {
        if (attachmentId === "a1") {
          return { downloadUrl: "http://minio/one", expiresInSeconds: 300, fileName: "one.png", mimeType: "image/png", sizeBytes: 100, kind: "image" as const, createdAt: "2024-01-01T00:00:00Z" };
        }
        return { downloadUrl: "http://minio/two", expiresInSeconds: 300, fileName: "two.png", mimeType: "image/png", sizeBytes: 200, kind: "image" as const, createdAt: "2024-01-01T00:00:00Z" };
      });

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachment-image-m1-a1")).toBeInTheDocument();
      });
      await userEvent.click(screen.getByTestId("message-attachment-image-m1-a1"));
      await waitFor(() => {
        expect(screen.getByTestId("image-lightbox")).toBeInTheDocument();
      });

      expect(screen.getByText("1 / 2")).toBeInTheDocument();
      expect(screen.getByTestId("lightbox-prev")).toBeInTheDocument();
      expect(screen.getByTestId("lightbox-next")).toBeInTheDocument();
    });

    it("lightbox prev/next buttons switch image", async () => {
      const msgWithImages: Message = {
        ...ownMessage,
        content: "",
        attachments: [
          {
            id: "a1",
            fileName: "one.png",
            mimeType: "image/png",
            sizeBytes: 100,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
          {
            id: "a2",
            fileName: "two.png",
            mimeType: "image/png",
            sizeBytes: 200,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      mockChannelAndMessages([msgWithImages], []);
      vi.mocked(getAttachmentDownloadUrl).mockImplementation(async (_t, _w, _c, _m, attachmentId) => {
        if (attachmentId === "a1") {
          return { downloadUrl: "http://minio/one", expiresInSeconds: 300, fileName: "one.png", mimeType: "image/png", sizeBytes: 100, kind: "image" as const, createdAt: "2024-01-01T00:00:00Z" };
        }
        return { downloadUrl: "http://minio/two", expiresInSeconds: 300, fileName: "two.png", mimeType: "image/png", sizeBytes: 200, kind: "image" as const, createdAt: "2024-01-01T00:00:00Z" };
      });

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachment-image-m1-a1")).toBeInTheDocument();
      });
      await userEvent.click(screen.getByTestId("message-attachment-image-m1-a1"));
      await waitFor(() => {
        expect(screen.getByTestId("lightbox-image")).toHaveAttribute("src", "http://minio/one");
      });

      await userEvent.click(screen.getByTestId("lightbox-next"));
      await waitFor(() => {
        expect(screen.getByTestId("lightbox-image")).toHaveAttribute("src", "http://minio/two");
      });
      expect(screen.getByText("2 / 2")).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("lightbox-prev"));
      await waitFor(() => {
        expect(screen.getByTestId("lightbox-image")).toHaveAttribute("src", "http://minio/one");
      });
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
    });

    it("lightbox ArrowLeft/ArrowRight switches image", async () => {
      const msgWithImages: Message = {
        ...ownMessage,
        content: "",
        attachments: [
          {
            id: "a1",
            fileName: "one.png",
            mimeType: "image/png",
            sizeBytes: 100,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
          {
            id: "a2",
            fileName: "two.png",
            mimeType: "image/png",
            sizeBytes: 200,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      mockChannelAndMessages([msgWithImages], []);
      vi.mocked(getAttachmentDownloadUrl).mockImplementation(async (_t, _w, _c, _m, attachmentId) => {
        if (attachmentId === "a1") {
          return { downloadUrl: "http://minio/one", expiresInSeconds: 300, fileName: "one.png", mimeType: "image/png", sizeBytes: 100, kind: "image" as const, createdAt: "2024-01-01T00:00:00Z" };
        }
        return { downloadUrl: "http://minio/two", expiresInSeconds: 300, fileName: "two.png", mimeType: "image/png", sizeBytes: 200, kind: "image" as const, createdAt: "2024-01-01T00:00:00Z" };
      });

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachment-image-m1-a1")).toBeInTheDocument();
      });
      await userEvent.click(screen.getByTestId("message-attachment-image-m1-a1"));
      await waitFor(() => {
        expect(screen.getByTestId("lightbox-image")).toHaveAttribute("src", "http://minio/one");
      });

      await userEvent.keyboard("{ArrowRight}");
      await waitFor(() => {
        expect(screen.getByTestId("lightbox-image")).toHaveAttribute("src", "http://minio/two");
      });

      await userEvent.keyboard("{ArrowLeft}");
      await waitFor(() => {
        expect(screen.getByTestId("lightbox-image")).toHaveAttribute("src", "http://minio/one");
      });
    });

    it("lightbox hides navigation for single image", async () => {
      const msgWithImage: Message = {
        ...ownMessage,
        content: "",
        attachments: [
          {
            id: "a2",
            fileName: "photo.png",
            mimeType: "image/png",
            sizeBytes: 1234,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      mockChannelAndMessages([msgWithImage], []);
      vi.mocked(getAttachmentDownloadUrl).mockResolvedValueOnce({
        downloadUrl: "http://minio/img",
        expiresInSeconds: 300,
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        kind: "image",
        createdAt: "2024-01-01T00:00:00Z",
      });

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachment-image-m1-a2")).toBeInTheDocument();
      });
      await userEvent.click(screen.getByTestId("message-attachment-image-m1-a2"));
      await waitFor(() => {
        expect(screen.getByTestId("image-lightbox")).toBeInTheDocument();
      });

      expect(screen.queryByTestId("lightbox-prev")).not.toBeInTheDocument();
      expect(screen.queryByTestId("lightbox-next")).not.toBeInTheDocument();
      expect(screen.queryByText(/\/ 1/)).not.toBeInTheDocument();
    });

    it("lightbox download button triggers download", async () => {
      const msgWithImage: Message = {
        ...ownMessage,
        content: "",
        attachments: [
          {
            id: "a2",
            fileName: "photo.png",
            mimeType: "image/png",
            sizeBytes: 1234,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      mockChannelAndMessages([msgWithImage], []);
      vi.mocked(getAttachmentDownloadUrl).mockResolvedValueOnce({
        downloadUrl: "http://minio/img",
        expiresInSeconds: 300,
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        kind: "image",
        createdAt: "2024-01-01T00:00:00Z",
      });
      const openMock = vi.spyOn(window, "open").mockImplementation(() => null);

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachment-image-m1-a2")).toBeInTheDocument();
      });
      await userEvent.click(screen.getByTestId("message-attachment-image-m1-a2"));
      await waitFor(() => {
        expect(screen.getByTestId("image-lightbox")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("lightbox-download"));

      await waitFor(() => {
        expect(getAttachmentDownloadUrl).toHaveBeenCalledWith("token", "ws1", "ch1", "m1", "a2");
      });
      expect(openMock).toHaveBeenCalledWith("http://minio/img", "_blank");
      openMock.mockRestore();
    });

    it("lightbox shows error when image URL fails to load", async () => {
      const msgWithImage: Message = {
        ...ownMessage,
        content: "",
        attachments: [
          {
            id: "a2",
            fileName: "photo.png",
            mimeType: "image/png",
            sizeBytes: 1234,
            kind: "image",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      mockChannelAndMessages([msgWithImage], []);
      vi.mocked(getAttachmentDownloadUrl).mockResolvedValueOnce({
        downloadUrl: "http://minio/img",
        expiresInSeconds: 300,
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 1234,
        kind: "image",
        createdAt: "2024-01-01T00:00:00Z",
      });

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachment-image-m1-a2")).toBeInTheDocument();
      });

      vi.mocked(getAttachmentDownloadUrl).mockRejectedValueOnce(new Error("Network error"));

      await userEvent.click(screen.getByTestId("message-attachment-image-m1-a2"));
      await waitFor(() => {
        expect(screen.getByTestId("image-lightbox")).toBeInTheDocument();
      });

      expect(await screen.findByText(/Failed to load image/i)).toBeInTheDocument();
    });

    it("non-image attachment still renders as file card and does not open lightbox", async () => {
      mockChannelAndMessages([ownMessageWithAttachment], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachments-m1")).toBeInTheDocument();
      });

      expect(screen.getByTestId("message-attachment-m1-a1")).toBeInTheDocument();
      expect(screen.queryByTestId("message-attachment-image-m1-a1")).not.toBeInTheDocument();
    });

    it("does not render empty text block for attachments-only message", async () => {
      const msgWithAttachment: Message = {
        ...ownMessage,
        content: "",
        attachments: [
          {
            id: "a1",
            fileName: "doc.pdf",
            mimeType: "application/pdf",
            sizeBytes: 5678,
            kind: "file",
            createdAt: "2024-01-01T00:00:00Z",
          },
        ],
      };
      mockChannelAndMessages([msgWithAttachment], []);
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("message-attachments-m1")).toBeInTheDocument();
      });
      const bubble = screen.getByTestId("message-bubble-m1");
      expect(bubble.querySelector("p.whitespace-pre-wrap")).not.toBeInTheDocument();
    });

    it("shows upload progress during send", async () => {
      mockChannelAndMessages([], []);
      vi.mocked(presignAttachmentUpload).mockResolvedValueOnce({
        uploadUrl: "http://minio/upload",
        storageKey: "attachments/u1/uuid-file.txt",
        fileName: "test.txt",
        mimeType: "text/plain",
        sizeBytes: 7,
        kind: "file",
        expiresInSeconds: 300,
      });
      let progressCb: ((p: number) => void) | undefined;
      let resolveUpload: (() => void) | undefined;
      vi.mocked(uploadAttachmentToPresignedUrlWithProgress).mockImplementationOnce((_, __, onProgress) => {
        progressCb = onProgress;
        return new Promise((resolve) => {
          resolveUpload = resolve;
        });
      });
      vi.mocked(createMessage).mockResolvedValueOnce({
        id: "m2",
        channelId: "ch1",
        content: "hello",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        reactions: [],
        attachments: [],
      });

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "test.txt", { type: "text/plain" });
      await userEvent.upload(screen.getByTestId("composer-file-input"), file);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attachment-chip-0")).toBeInTheDocument();
      });

      await userEvent.type(screen.getByPlaceholderText("Type a message…"), "hello");
      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => {
        expect(screen.getByText("Uploading…")).toBeInTheDocument();
      });

      progressCb?.(50);

      await waitFor(() => {
        expect(screen.getByText("50%")).toBeInTheDocument();
      });

      progressCb?.(100);
      resolveUpload?.();

      await waitFor(() => {
        expect(createMessage).toHaveBeenCalled();
      });
    });

    it("retry failed upload calls presign and upload again", async () => {
      mockChannelAndMessages([], []);
      vi.mocked(presignAttachmentUpload).mockRejectedValueOnce(new Error("Presign failed"));
      vi.mocked(presignAttachmentUpload).mockResolvedValueOnce({
        uploadUrl: "http://minio/upload",
        storageKey: "attachments/u1/uuid-file.txt",
        fileName: "test.txt",
        mimeType: "text/plain",
        sizeBytes: 7,
        kind: "file",
        expiresInSeconds: 300,
      });
      vi.mocked(uploadAttachmentToPresignedUrlWithProgress).mockResolvedValueOnce(undefined);
      vi.mocked(createMessage).mockResolvedValueOnce({
        id: "m2",
        channelId: "ch1",
        content: "",
        parentId: null,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        editedAt: null,
        author: { id: "u1", username: "alice", displayName: null, avatarUrl: null },
        reactions: [],
        attachments: [],
      });

      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "test.txt", { type: "text/plain" });
      await userEvent.upload(screen.getByTestId("composer-file-input"), file);

      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => {
        expect(screen.getByText("Upload failed")).toBeInTheDocument();
      });
      expect(screen.getByTestId("composer-attachment-retry-0")).toBeInTheDocument();

      await userEvent.click(screen.getByTestId("composer-attachment-retry-0"));

      await waitFor(() => {
        expect(presignAttachmentUpload).toHaveBeenCalledTimes(2);
      });
      expect(uploadAttachmentToPresignedUrlWithProgress).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.queryByTestId("composer-attachment-retry-0")).not.toBeInTheDocument();
      });
    });

    it("send disabled while uploading", async () => {
      mockChannelAndMessages([], []);
      vi.mocked(presignAttachmentUpload).mockResolvedValueOnce({
        uploadUrl: "http://minio/upload",
        storageKey: "attachments/u1/uuid-file.txt",
        fileName: "test.txt",
        mimeType: "text/plain",
        sizeBytes: 7,
        kind: "file",
        expiresInSeconds: 300,
      });
      vi.mocked(uploadAttachmentToPresignedUrlWithProgress).mockImplementationOnce(() => new Promise(() => {}));
      render(<ChannelDetailPage />);
      await waitFor(() => {
        expect(screen.getByTestId("composer-attach-button")).toBeInTheDocument();
      });

      const file = new File(["content"], "test.txt", { type: "text/plain" });
      await userEvent.upload(screen.getByTestId("composer-file-input"), file);

      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => {
        expect(screen.getByText("Uploading…")).toBeInTheDocument();
      });

      const sendButton = screen.getByRole("button", { name: /send/i });
      expect(sendButton).toBeDisabled();
    });
  });
});

describe("ChannelDetailPage — message context mode", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  });

  it("shows context messages and back button when search result not in DOM", async () => {
    const existing = [
      { id: "m1", channelId: "ch1", content: "first", parentId: null, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", editedAt: null, author: { id: "u1", username: "alice", displayName: null, avatarUrl: null }, reactions: [] },
      { id: "m2", channelId: "ch1", content: "second", parentId: null, createdAt: "2024-01-01T00:01:00Z", updatedAt: "2024-01-01T00:01:00Z", editedAt: null, author: { id: "u1", username: "alice", displayName: null, avatarUrl: null }, reactions: [] },
    ];
    const target = { id: "m-old", channelId: "ch1", content: "old message", parentId: null, createdAt: "2024-01-01T00:02:00Z", updatedAt: "2024-01-01T00:02:00Z", editedAt: null, author: { id: "u2", username: "bob", displayName: null, avatarUrl: null }, reactions: [] };
    mockChannelAndMessages(existing, []);

    vi.mocked(searchChannelMessages).mockResolvedValueOnce({
      items: [target],
      nextCursor: null,
    });
    vi.mocked(getMessageContext).mockResolvedValueOnce({
      target,
      before: [existing[0]],
      after: [],
      hasMoreBefore: false,
      hasMoreAfter: false,
    });

    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("first")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "old" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("search-result-m-old")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("search-result-m-old"));

    await waitFor(() => {
      expect(screen.getByTestId("back-to-latest-button")).toBeInTheDocument();
    });
    expect(screen.getByText("old message")).toBeInTheDocument();
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.queryByText("second")).not.toBeInTheDocument();
  });

  it("restores original messages when back to latest is clicked", async () => {
    const existing = [
      { id: "m1", channelId: "ch1", content: "first", parentId: null, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", editedAt: null, author: { id: "u1", username: "alice", displayName: null, avatarUrl: null }, reactions: [] },
      { id: "m2", channelId: "ch1", content: "second", parentId: null, createdAt: "2024-01-01T00:01:00Z", updatedAt: "2024-01-01T00:01:00Z", editedAt: null, author: { id: "u1", username: "alice", displayName: null, avatarUrl: null }, reactions: [] },
    ];
    const target = { id: "m-old", channelId: "ch1", content: "old message", parentId: null, createdAt: "2024-01-01T00:02:00Z", updatedAt: "2024-01-01T00:02:00Z", editedAt: null, author: { id: "u2", username: "bob", displayName: null, avatarUrl: null }, reactions: [] };
    mockChannelAndMessages(existing, []);

    vi.mocked(searchChannelMessages).mockResolvedValueOnce({
      items: [target],
      nextCursor: null,
    });
    vi.mocked(getMessageContext).mockResolvedValueOnce({
      target,
      before: [existing[0]],
      after: [],
      hasMoreBefore: false,
      hasMoreAfter: false,
    });

    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("first")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("search-toggle-button"));
    fireEvent.change(screen.getByTestId("search-input"), { target: { value: "old" } });
    fireEvent.click(screen.getByTestId("search-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("search-result-m-old")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("search-result-m-old"));

    await waitFor(() => {
      expect(screen.getByTestId("back-to-latest-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("back-to-latest-button"));

    await waitFor(() => {
      expect(screen.queryByTestId("back-to-latest-button")).not.toBeInTheDocument();
    });
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
    expect(screen.queryByText("old message")).not.toBeInTheDocument();
  });
});
