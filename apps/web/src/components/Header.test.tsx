import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Header from "./Header";
import { useAuth } from "@/lib/auth-context";

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function mockAuth(overrides?: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    accessToken: null,
    refreshToken: null,
    isLoading: false,
    isAuthenticated: false,
    loginSuccess: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useAuth>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Header — global unread", () => {
  it("does not show global unread badge when total is 0", () => {
    mockAuth({ isAuthenticated: true, user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true, } });
    render(<Header />);
    expect(screen.queryByTestId("header-global-unread")).not.toBeInTheDocument();
  });

  it("shows global unread badge when total > 0", () => {
    mockAuth({ isAuthenticated: true, user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true, } });
    render(<Header />);
    act(() => {
      window.dispatchEvent(new CustomEvent("global-unread:changed", { detail: { total: 5 } }));
    });
    expect(screen.getByTestId("header-global-unread")).toHaveTextContent("5");
  });

  it("shows 99+ for large unread counts", () => {
    mockAuth({ isAuthenticated: true, user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true, } });
    render(<Header />);
    act(() => {
      window.dispatchEvent(new CustomEvent("global-unread:changed", { detail: { total: 150 } }));
    });
    expect(screen.getByTestId("header-global-unread")).toHaveTextContent("99+");
  });

  it("hides badge when unread returns to 0", () => {
    mockAuth({ isAuthenticated: true, user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true, } });
    render(<Header />);
    act(() => {
      window.dispatchEvent(new CustomEvent("global-unread:changed", { detail: { total: 5 } }));
    });
    expect(screen.getByTestId("header-global-unread")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent("global-unread:changed", { detail: { total: 0 } }));
    });
    expect(screen.queryByTestId("header-global-unread")).not.toBeInTheDocument();
  });
});

describe("Header — global search", () => {
  it("shows global search button for authenticated user", () => {
    mockAuth({
      isAuthenticated: true,
      user: {
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
      },
    });
    render(<Header />);
    expect(screen.getByTestId("global-search-open-button")).toBeInTheDocument();
  });

  it("does not show global search button for unauthenticated user", () => {
    mockAuth({ isAuthenticated: false });
    render(<Header />);
    expect(screen.queryByTestId("global-search-open-button")).not.toBeInTheDocument();
  });
});

describe("Header — localization", () => {
  it("shows localized loading text in en", () => {
    localStorage.setItem("lets-chat:locale", "en");
    mockAuth({ isLoading: true });
    render(<Header />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows localized loading text in ru", () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockAuth({ isLoading: true });
    render(<Header />);
    expect(screen.getByText("Загрузка…")).toBeInTheDocument();
  });

  it("shows localized loading text in uk", () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockAuth({ isLoading: true });
    render(<Header />);
    expect(screen.getByText("Завантаження…")).toBeInTheDocument();
  });
});
