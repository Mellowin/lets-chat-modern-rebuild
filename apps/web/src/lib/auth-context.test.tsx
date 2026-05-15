import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./auth-context";
import { getMe, logout as apiLogout } from "./auth-api";

vi.mock("@/lib/auth-api", () => ({
  getMe: vi.fn(),
  logout: vi.fn(),
}));

function TestConsumer() {
  const { isLoading, isAuthenticated, user, loginSuccess, logout } = useAuth();
  return (
    <div>
      <div data-testid="loading">{isLoading ? "loading" : "done"}</div>
      <div data-testid="auth">{isAuthenticated ? "yes" : "no"}</div>
      <div data-testid="user">{user ? `${user.username} (${user.email})` : "null"}</div>
      <button
        data-testid="login-btn"
        onClick={() =>
          loginSuccess({
            user: { id: "u1", email: "a@b.com", username: "alice", createdAt: "2024-01-01T00:00:00Z" },
            accessToken: "at",
            refreshToken: "rt",
          })
        }
      >
        Login
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
    sessionStorage.setItem("accessToken", "valid-token");
    sessionStorage.setItem("refreshToken", "refresh-token");
    vi.mocked(getMe).mockResolvedValueOnce({
      id: "u1",
      email: "a@b.com",
      username: "alice",
      createdAt: "2024-01-01T00:00:00Z",
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("done");
    });

    expect(getMe).toHaveBeenCalledWith("valid-token");
    expect(screen.getByTestId("auth")).toHaveTextContent("yes");
    expect(screen.getByTestId("user")).toHaveTextContent("alice (a@b.com)");
  });

  it("clears tokens and stays unauthenticated when getMe throws", async () => {
    sessionStorage.setItem("accessToken", "bad-token");
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
    sessionStorage.setItem("accessToken", "at");
    sessionStorage.setItem("refreshToken", "rt");
    vi.mocked(getMe).mockResolvedValueOnce({
      id: "u1",
      email: "a@b.com",
      username: "alice",
      createdAt: "2024-01-01T00:00:00Z",
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
    sessionStorage.setItem("accessToken", "at");
    sessionStorage.setItem("refreshToken", "rt");
    vi.mocked(getMe).mockResolvedValueOnce({
      id: "u1",
      email: "a@b.com",
      username: "alice",
      createdAt: "2024-01-01T00:00:00Z",
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
