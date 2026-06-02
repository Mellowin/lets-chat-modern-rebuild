import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import DirectMessagesPage from "./page";
import { useAuth } from "@/lib/auth-context";
import { listDirectConversations, createDirectConversation } from "@/lib/direct-conversations-api";

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
      {
        id: "dc1",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        otherParticipant: { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null },
        lastMessage: { id: "dm1", content: "Hey", createdAt: "2024-01-01T00:00:00Z", authorId: "u2" },
      },
    ]);

    render(<DirectMessagesPage />);

    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
    expect(screen.getByText("Hey")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bob/i })).toHaveAttribute("href", "/direct/dc1");
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
