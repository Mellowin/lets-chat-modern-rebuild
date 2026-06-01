import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import ChannelDetailPage from "./page";
import { getChannel, getChannelMembers, addChannelMember, removeChannelMember, leaveChannel, archiveChannel, type ChannelMember } from "@/lib/channels-api";
import { createChannelInvite } from "@/lib/channel-invites-api";
import { getMessages, createMessage, updateMessage, deleteMessage, Message } from "@/lib/messages-api";

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
}));

vi.mock("@/lib/channel-invites-api", () => ({
  createChannelInvite: vi.fn(),
}));

vi.mock("@/lib/messages-api", () => ({
  getMessages: vi.fn(),
  createMessage: vi.fn(),
  updateMessage: vi.fn(),
  deleteMessage: vi.fn(),
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
    expect(screen.getByText("Підключення")).toBeInTheDocument();
  });

  it("shows Russian socket status label", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([], []);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Назад к рабочему пространству/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Подключение")).toBeInTheDocument();
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
  };

  it("shows Edit and Delete buttons on own message", async () => {
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete/i })).toBeInTheDocument();
  });

  it("hides Edit and Delete buttons on other user's message", async () => {
    mockChannelAndMessages([otherMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hi")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete/i })).not.toBeInTheDocument();
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

    await userEvent.click(screen.getByRole("button", { name: /Edit/i }));

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

    await userEvent.click(screen.getByRole("button", { name: /Edit/i }));

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

    await userEvent.click(screen.getByRole("button", { name: /Edit/i }));

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

    await userEvent.click(screen.getByRole("button", { name: /Delete/i }));

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

    await userEvent.click(screen.getByRole("button", { name: /Delete/i }));

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

    await userEvent.click(screen.getByRole("button", { name: /Delete/i }));

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
  };

  it("shows Ukrainian Edit and Delete buttons", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Редагувати/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Видалити/i })).toBeInTheDocument();
  });

  it("shows Russian Edit and Delete buttons", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Редактировать/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Удалить/i })).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole("button", { name: /Редагувати/i }));

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

    await userEvent.click(screen.getByRole("button", { name: /Редактировать/i }));

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

    await userEvent.click(screen.getByRole("button", { name: /Видалити/i }));

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

    await userEvent.click(screen.getByRole("button", { name: /Удалить/i }));

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
    vi.mocked(archiveChannel).mockResolvedValueOnce(undefined);

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
  };

  it("renders own messages left-aligned", async () => {
    mockChannelAndMessages([ownMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Own message")).toBeInTheDocument();
    });
    expect(screen.getByTestId("message-row-m1")).toHaveClass("items-start");
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
  });

  it("shows avatars for all messages", async () => {
    mockChannelAndMessages([otherMessage, ownMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Own message")).toBeInTheDocument();
    });
    expect(screen.getByTestId("message-row-m2")).toHaveClass("items-start");
    expect(screen.getByTestId("message-row-m1")).toHaveClass("items-start");
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
  };

  it("shows Reply button on regular messages", async () => {
    mockChannelAndMessages([ownStandaloneMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Standalone")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Reply/i })).toBeInTheDocument();
  });

  it("hides Reply button on reply messages", async () => {
    mockChannelAndMessages([replyMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("This is a reply")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Reply/i })).not.toBeInTheDocument();
  });

  it("hides Reply button while editing a message", async () => {
    mockChannelAndMessages([ownStandaloneMessage]);
    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Standalone")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(screen.queryByRole("button", { name: /Reply/i })).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: /Reply/i }));
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
    await userEvent.click(screen.getByRole("button", { name: /Reply/i }));
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
    });

    render(<ChannelDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Parent message content")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: /Reply/i }));
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
    await userEvent.click(screen.getByRole("button", { name: /Reply/i }));
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
