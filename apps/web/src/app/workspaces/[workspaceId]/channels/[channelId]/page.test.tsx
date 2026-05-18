import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import ChannelDetailPage from "./page";
import { getChannel, getChannelMembers, addChannelMember, removeChannelMember, leaveChannel, type ChannelMember } from "@/lib/channels-api";
import { getMessages, createMessage, updateMessage, deleteMessage, Message } from "@/lib/messages-api";

const socketHandlers: Record<string, (...args: unknown[]) => void> = {};
const socketOnMock = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
  socketHandlers[event] = handler;
});
const socketEmitMock = vi.fn();
const socketDisconnectMock = vi.fn();

const routerPushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceId: "ws1", channelId: "ch1" }),
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

vi.mock("@/lib/channels-api", () => ({
  getChannel: vi.fn(),
  getChannelMembers: vi.fn(),
  addChannelMember: vi.fn(),
  removeChannelMember: vi.fn(),
  leaveChannel: vi.fn(),
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

describe("ChannelDetailPage — composer", () => {
  beforeEach(() => {
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
});

describe("ChannelDetailPage — edit/delete", () => {
  beforeEach(() => {
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

describe("ChannelDetailPage — WebSocket live events", () => {
  beforeEach(() => {
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
    socketHandlers["message:updated"]({
      ...ownMessage,
      content: "Updated via WS",
      editedAt: "2024-01-02T00:00:00Z",
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

    socketHandlers["message:updated"]({
      ...ownMessage,
      channelId: "ch-other",
      content: "Updated via WS",
      editedAt: "2024-01-02T00:00:00Z",
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
    socketHandlers["message:deleted"]({ id: "m1", channelId: "ch1", deletedAt: "2024-01-02T00:00:00Z" });

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

    socketHandlers["message:deleted"]({ id: "m1", channelId: "ch-other", deletedAt: "2024-01-02T00:00:00Z" });

    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});


describe("ChannelDetailPage — members", () => {
  beforeEach(() => {
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

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("OWNER")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  it("shows displayName with @username when displayName is present", async () => {
    mockChannelAndMessages([], [ownerMember]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    expect(screen.getByText("@alice")).toBeInTheDocument();
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

    await waitFor(() => {
      expect(screen.getByText("@dave")).toBeInTheDocument();
    });
    expect(screen.queryByText("Dave")).not.toBeInTheDocument();
  });

  it("shows add member form for OWNER with role select", async () => {
    mockChannelAndMessages([], [ownerMember]);
    render(<ChannelDetailPage />);

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

  it("adds member successfully and updates list", async () => {
    mockChannelAndMessages([], [ownerMember]);
    const newMember: ChannelMember = {
      id: "cm4",
      channelId: "ch1",
      role: "MEMBER",
      joinedAt: "2024-01-02T00:00:00Z",
      user: { id: "u3", username: "charlie", displayName: "Charlie" },
    };
    vi.mocked(addChannelMember).mockResolvedValueOnce(newMember);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "charlie");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));

    await waitFor(() => {
      expect(addChannelMember).toHaveBeenCalledWith("token", "ws1", "ch1", { identifier: "charlie", role: "MEMBER" });
    });

    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.getByText("Member added successfully.")).toBeInTheDocument();
  });

  it("shows error on empty add member submit", async () => {
    mockChannelAndMessages([], [ownerMember]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole("button", { name: /Add/i }));

    expect(await screen.findByText(/Username or email is required/i)).toBeInTheDocument();
    expect(addChannelMember).not.toHaveBeenCalled();
  });

  it("shows backend error on add member failure", async () => {
    mockChannelAndMessages([], [ownerMember]);
    vi.mocked(addChannelMember).mockRejectedValueOnce(new Error("Already a member"));

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "bob");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));

    expect(await screen.findByText(/Already a member/i)).toBeInTheDocument();
  });

  it("OWNER can add member as ADMIN", async () => {
    mockChannelAndMessages([], [ownerMember]);
    const newMember: ChannelMember = {
      id: "cm4",
      channelId: "ch1",
      role: "ADMIN",
      joinedAt: "2024-01-02T00:00:00Z",
      user: { id: "u3", username: "charlie", displayName: "Charlie" },
    };
    vi.mocked(addChannelMember).mockResolvedValueOnce(newMember);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "charlie");
    await userEvent.selectOptions(screen.getByRole("combobox"), "ADMIN");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));

    await waitFor(() => {
      expect(addChannelMember).toHaveBeenCalledWith("token", "ws1", "ch1", { identifier: "charlie", role: "ADMIN" });
    });

    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
  });

  it("ADMIN add does not send role", async () => {
    const adminAlice: ChannelMember = {
      id: "cm1",
      channelId: "ch1",
      role: "ADMIN",
      joinedAt: "2024-01-01T00:00:00Z",
      user: { id: "u1", username: "alice", displayName: "Alice" },
    };
    mockChannelAndMessages([], [adminAlice]);
    const newMember: ChannelMember = {
      id: "cm4",
      channelId: "ch1",
      role: "MEMBER",
      joinedAt: "2024-01-02T00:00:00Z",
      user: { id: "u3", username: "charlie", displayName: "Charlie" },
    };
    vi.mocked(addChannelMember).mockResolvedValueOnce(newMember);

    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Username or email/i), "charlie");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));

    await waitFor(() => {
      expect(addChannelMember).toHaveBeenCalledWith("token", "ws1", "ch1", { identifier: "charlie" });
    });

    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });
});


describe("ChannelDetailPage — remove member", () => {
  beforeEach(() => {
    sessionStorage.setItem("accessToken", "token");
    vi.clearAllMocks();
    socketOnMock.mockReset();
    socketEmitMock.mockReset();
    socketDisconnectMock.mockReset();
    Object.keys(socketHandlers).forEach((k) => delete socketHandlers[k]);
  });

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

    await waitFor(() => {
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });
    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    expect(removeButtons.length).toBe(1);
  });

  it("OWNER sees Remove for ADMIN", async () => {
    mockChannelAndMessages([], [ownerAlice, adminBob]);
    render(<ChannelDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
    const removeButtons = screen.getAllByRole("button", { name: /Remove/i });
    expect(removeButtons.length).toBe(1);
  });

  it("OWNER does not see Remove for OWNER", async () => {
    mockChannelAndMessages([], [ownerAlice]);
    render(<ChannelDetailPage />);

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

    await waitFor(() => {
      expect(screen.getByText("Dave")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
  });

  it("MEMBER sees no Remove buttons", async () => {
    mockChannelAndMessages([], [regularMember, memberCharlie]);
    render(<ChannelDetailPage />);

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

    await waitFor(() => {
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Remove/i }));

    expect(removeChannelMember).not.toHaveBeenCalled();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });
});
