import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./auth-context";
import { getMe, logout as apiLogout } from "./auth-api";
import { performSilentRefresh } from "./auth-fetch";
import { useLocale } from "./locale";

function makeToken(exp: number): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ sub: "u1", exp }));
  return `${header}.${payload}.signature`;
}

const validAccessToken = makeToken(Math.floor(Date.now() / 1000) + 3600);
const expiredAccessToken = makeToken(Math.floor(Date.now() / 1000) - 3600);

vi.mock("@/lib/auth-api", () => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  isTokenExpired: (token: string, bufferSeconds = 60) => {
    try {
      const payload = JSON.parse(atob(token.split(".")[1])) as { exp?: number } | undefined;
      if (!payload || typeof payload.exp !== "number") return true;
      return payload.exp * 1000 <= Date.now() + bufferSeconds * 1000;
    } catch {
      return true;
    }
  },
}));

vi.mock("@/lib/auth-fetch", () => ({
  performSilentRefresh: vi.fn(),
  AUTH_EVENTS: {
    TOKENS_REFRESHED: "auth:tokens-refreshed",
    SESSION_EXPIRED: "auth:session-expired",
  },
}));

function TestConsumer() {
  const { isLoading, isAuthenticated, user, loginSuccess, setUser, logout } = useAuth();
  return (
    <div>
      <div data-testid="loading">{isLoading ? "loading" : "done"}</div>
      <div data-testid="auth">{isAuthenticated ? "yes" : "no"}</div>
      <div data-testid="user">{user ? `${user.username} (${user.email})` : "null"}</div>
      <button
        data-testid="login-btn"
        onClick={() =>
          loginSuccess({
            user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true, },
            accessToken: "at",
            refreshToken: "rt",
          })
        }
      >
        Login
      </button>
      <button
        data-testid="setuser-btn"
        onClick={() =>
          setUser({ id: "u1", email: "a@b.com", username: "alice", displayName: "Alice", avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true, })
        }
      >
        SetUser
      </button>
      <button data-testid="logout-btn" onClick={() => logout()}>
        Logout
      </button>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(getMe).mockReset();
    vi.mocked(apiLogout).mockReset();
    vi.mocked(performSilentRefresh).mockReset();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("finishes loading with no tokens and unauthenticated state", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("done");
    });

    expect(screen.getByTestId("auth")).toHaveTextContent("no");
    expect(screen.getByTestId("user")).toHaveTextContent("null");
  });

  it("initializes from valid accessToken in sessionStorage", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "refresh-token");
    vi.mocked(getMe).mockResolvedValueOnce({
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
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("done");
    });

    expect(getMe).toHaveBeenCalledWith(validAccessToken);
    expect(screen.getByTestId("auth")).toHaveTextContent("yes");
    expect(screen.getByTestId("user")).toHaveTextContent("alice (a@b.com)");
  });

  it("clears tokens and stays unauthenticated when getMe throws", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "refresh-token");
    vi.mocked(getMe).mockRejectedValueOnce(new Error("Unauthorized"));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("done");
    });

    expect(screen.getByTestId("auth")).toHaveTextContent("no");
    expect(screen.getByTestId("user")).toHaveTextContent("null");
    expect(sessionStorage.getItem("accessToken")).toBeNull();
    expect(sessionStorage.getItem("refreshToken")).toBeNull();
  });

  it("silently refreshes and initializes user when accessToken is expired", async () => {
    sessionStorage.setItem("accessToken", expiredAccessToken);
    sessionStorage.setItem("refreshToken", "refresh-token");
    vi.mocked(performSilentRefresh).mockResolvedValueOnce({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true, },
      accessToken: validAccessToken,
      refreshToken: "new-refresh-token",
    });
    vi.mocked(getMe).mockResolvedValueOnce({
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
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("yes");
    });

    expect(performSilentRefresh).toHaveBeenCalled();
    expect(getMe).toHaveBeenCalledWith(validAccessToken);
    expect(sessionStorage.getItem("refreshToken")).toBe("new-refresh-token");
    expect(screen.getByTestId("user")).toHaveTextContent("alice (a@b.com)");
  });

  it("clears tokens and stays unauthenticated when refresh fails", async () => {
    sessionStorage.setItem("accessToken", expiredAccessToken);
    sessionStorage.setItem("refreshToken", "refresh-token");
    vi.mocked(performSilentRefresh).mockRejectedValueOnce(new Error("Invalid refresh token"));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("done");
    });

    expect(apiLogout).not.toHaveBeenCalled();
    expect(screen.getByTestId("auth")).toHaveTextContent("no");
    expect(sessionStorage.getItem("accessToken")).toBeNull();
    expect(sessionStorage.getItem("refreshToken")).toBeNull();
  });

  it("silently refreshes when getMe rejects for a non-expired access token", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "refresh-token");
    vi.mocked(getMe).mockRejectedValueOnce(new Error("Unauthorized"));
    vi.mocked(performSilentRefresh).mockResolvedValueOnce({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true, },
      accessToken: "refreshed-access-token",
      refreshToken: "new-refresh-token",
    });
    vi.mocked(getMe).mockResolvedValueOnce({
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
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("yes");
    });

    expect(performSilentRefresh).toHaveBeenCalled();
    expect(getMe).toHaveBeenLastCalledWith("refreshed-access-token");
    expect(sessionStorage.getItem("accessToken")).toBe("refreshed-access-token");
    expect(sessionStorage.getItem("refreshToken")).toBe("new-refresh-token");
  });

  it("loginSuccess stores tokens and sets authenticated state", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("done");
    });

    await userEvent.click(screen.getByTestId("login-btn"));

    expect(sessionStorage.getItem("accessToken")).toBe("at");
    expect(sessionStorage.getItem("refreshToken")).toBe("rt");
    expect(screen.getByTestId("auth")).toHaveTextContent("yes");
    expect(screen.getByTestId("user")).toHaveTextContent("alice (a@b.com)");
  });

  it("logout clears tokens and unauthenticates", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "rt");
    vi.mocked(getMe).mockResolvedValueOnce({
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
    });
    vi.mocked(apiLogout).mockResolvedValueOnce({ success: true });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("yes");
    });

    await userEvent.click(screen.getByTestId("logout-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("no");
    });

    expect(apiLogout).toHaveBeenCalledWith("rt");
    expect(sessionStorage.getItem("accessToken")).toBeNull();
    expect(sessionStorage.getItem("refreshToken")).toBeNull();
    expect(screen.getByTestId("user")).toHaveTextContent("null");
  });

  it("logout still clears local state even if backend logout fails", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "rt");
    vi.mocked(getMe).mockResolvedValueOnce({
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
    });
    vi.mocked(apiLogout).mockRejectedValueOnce(new Error("Network error"));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("yes");
    });

    await userEvent.click(screen.getByTestId("logout-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("no");
    });

    expect(sessionStorage.getItem("accessToken")).toBeNull();
    expect(sessionStorage.getItem("refreshToken")).toBeNull();
    expect(screen.getByTestId("user")).toHaveTextContent("null");
  });

  it("setUser updates user without touching tokens", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    sessionStorage.setItem("refreshToken", "rt");
    vi.mocked(getMe).mockResolvedValueOnce({
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
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("yes");
    });

    await userEvent.click(screen.getByTestId("setuser-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("alice (a@b.com)");
    });
    expect(sessionStorage.getItem("accessToken")).toBe(validAccessToken);
  });

  it("syncs locale from getMe interfaceLanguage to mounted useLocale consumer", async () => {
    sessionStorage.setItem("accessToken", validAccessToken);
    vi.mocked(getMe).mockResolvedValueOnce({
      id: "u1",
      email: "a@b.com",
      username: "alice",
      displayName: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
      interfaceLanguage: "uk",
      role: "USER",
      createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
    });

    function LocaleConsumer() {
      const { locale, t } = useLocale();
      return (
        <div>
          <div data-testid="locale">{locale}</div>
          <div data-testid="locale-text">{t("dashboard.welcome")}</div>
        </div>
      );
    }

    render(
      <AuthProvider>
        <LocaleConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("locale")).toHaveTextContent("uk");
    });

    expect(screen.getByTestId("locale-text")).toHaveTextContent("Вітаємо");
    expect(localStorage.getItem("lets-chat:locale")).toBe("uk");
  });

  it("syncs locale from loginSuccess interfaceLanguage to mounted useLocale consumer", async () => {
    function LocaleConsumer() {
      const { locale, t } = useLocale();
      return (
        <div>
          <div data-testid="locale">{locale}</div>
          <div data-testid="locale-text">{t("dashboard.welcome")}</div>
        </div>
      );
    }

    function TestConsumerWithRuLogin() {
      const { isLoading, loginSuccess } = useAuth();
      return (
        <div>
          <div data-testid="loading">{isLoading ? "loading" : "done"}</div>
          <button
            data-testid="login-btn-ru"
            onClick={() =>
              loginSuccess({
                user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "ru", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true, },
                accessToken: "at",
                refreshToken: "rt",
              })
            }
          >
            Login Ru
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <TestConsumerWithRuLogin />
        <LocaleConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("done");
    });

    await userEvent.click(screen.getByTestId("login-btn-ru"));

    expect(localStorage.getItem("lets-chat:locale")).toBe("ru");
    expect(screen.getByTestId("locale")).toHaveTextContent("ru");
    expect(screen.getByTestId("locale-text")).toHaveTextContent("Добро пожаловать");
  });

  it("throws when useAuth is called outside AuthProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    function Rogue() {
      useAuth();
      return null;
    }

    expect(() => render(<Rogue />)).toThrow("useAuth must be used within AuthProvider");

    consoleError.mockRestore();
  });
});
