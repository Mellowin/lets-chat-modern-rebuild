import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import ProfilePage from "./page";
import { useAuth } from "@/lib/auth-context";
import { updateDisplayName } from "@/lib/auth-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/auth-api", () => ({
  updateDisplayName: vi.fn(),
}));

function mockAuth(userOverrides?: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, createdAt: "2024-01-01T00:00:00Z" },
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

describe("ProfilePage — unauthenticated", () => {
  it("shows auth required message", () => {
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

    render(<ProfilePage />);

    expect(screen.getByText(/Authentication required/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in/i })).toBeInTheDocument();
  });

  it("shows loading state when auth is loading", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: true,
      isAuthenticated: false,
      loginSuccess: vi.fn(),
      setUser: vi.fn(),
      logout: vi.fn(),
    } as ReturnType<typeof useAuth>);

    render(<ProfilePage />);

    expect(screen.getByText(/Loading session/i)).toBeInTheDocument();
  });
});

describe("ProfilePage — authenticated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders account information", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: "Alice", createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/Account information/i)).toBeInTheDocument();
    });

    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows dash when displayName is null", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/Account information/i)).toBeInTheDocument();
    });

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders display name input", async () => {
    mockAuth();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Your display name/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument();
  });

  it("shows current displayName if present", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: "Alice", createdAt: "2024-01-01T00:00:00Z" },
    });
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
    });
  });

  it("submits displayName update and shows success", async () => {
    const setUserMock = vi.fn();
    mockAuth({ setUser: setUserMock });
    vi.mocked(updateDisplayName).mockResolvedValueOnce({
      id: "u1",
      email: "a@b.com",
      username: "alice",
      displayName: "Alice",
      createdAt: "2024-01-01T00:00:00Z",
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Your display name/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Your display name/i), "Alice");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(updateDisplayName).toHaveBeenCalledWith("token", "Alice");
    });
    expect(setUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Alice" }),
    );
    expect(screen.getByText(/Display name updated/i)).toBeInTheDocument();
  });

  it("shows error on update failure", async () => {
    mockAuth();
    vi.mocked(updateDisplayName).mockRejectedValueOnce(new Error("Too long"));

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Your display name/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Your display name/i), "a".repeat(81));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    expect(await screen.findByText(/Too long/i)).toBeInTheDocument();
  });

  it("has a back link to dashboard", async () => {
    mockAuth();
    render(<ProfilePage />);

    const link = screen.getByRole("link", { name: /Back to dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/dashboard");
  });
});
