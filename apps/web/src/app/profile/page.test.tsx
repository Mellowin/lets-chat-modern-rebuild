import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import ProfilePage from "./page";
import { useAuth } from "@/lib/auth-context";
import { updateDisplayName, updateLanguages, uploadAvatar } from "@/lib/auth-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/auth-api", () => ({
  updateDisplayName: vi.fn(),
  updateLanguages: vi.fn(),
  uploadAvatar: vi.fn(),
}));

function mockAuth(userOverrides?: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, languages: [], createdAt: "2024-01-01T00:00:00Z" },
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
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: "Alice", avatarUrl: null, avatarUpdatedAt: null, languages: ["English", "Ukrainian"], createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/Account information/i)).toBeInTheDocument();
    });

    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("English, Ukrainian")).toBeInTheDocument();
  });

  it("shows dash when displayName is null", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, languages: [], createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/Account information/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows avatar fallback when avatarUrl is null", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, languages: [], createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Avatar/i })).toBeInTheDocument();
    });

    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("shows existing avatar when avatarUrl exists", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: "/uploads/avatars/u1/test.png", avatarUpdatedAt: "2024-01-01T00:00:00Z", languages: [], createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: /Avatar/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("img", { name: /Avatar/i })).toHaveAttribute("src", "/uploads/avatars/u1/test.png");
  });

  it("rejects unsupported avatar file type on client", async () => {
    mockAuth();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Avatar/i })).toBeInTheDocument();
    });

    const file = new File(["gif"], "avatar.gif", { type: "image/gif" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText(/Only JPEG, PNG, or WebP images are allowed/i)).toBeInTheDocument();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it("rejects avatar file over 2 MB on client", async () => {
    mockAuth();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Avatar/i })).toBeInTheDocument();
    });

    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "avatar.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    expect(await screen.findByText(/Image must be 2 MB or smaller/i)).toBeInTheDocument();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it("calls avatar upload endpoint with FormData field avatar", async () => {
    const setUserMock = vi.fn();
    mockAuth({ setUser: setUserMock });
    vi.mocked(uploadAvatar).mockResolvedValueOnce({
      id: "u1",
      email: "a@b.com",
      username: "alice",
      displayName: null,
      avatarUrl: "/uploads/avatars/u1/test.png",
      avatarUpdatedAt: "2024-01-01T00:00:00Z",
      languages: [],
      createdAt: "2024-01-01T00:00:00Z",
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Avatar/i })).toBeInTheDocument();
    });

    const file = new File(["png"], "avatar.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(uploadAvatar).toHaveBeenCalledWith("token", file);
    });
    expect(setUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: "/uploads/avatars/u1/test.png" }),
    );
  });

  it("allows displayName update", async () => {
    const setUserMock = vi.fn();
    mockAuth({ setUser: setUserMock });
    vi.mocked(updateDisplayName).mockResolvedValueOnce({
      id: "u1",
      email: "a@b.com",
      username: "alice",
      displayName: "Alice",
      avatarUrl: null,
      avatarUpdatedAt: null,
      languages: [],
      createdAt: "2024-01-01T00:00:00Z",
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Your display name/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Your display name/i), "Alice");
    await userEvent.click(screen.getByRole("button", { name: /Save$/i }));

    await waitFor(() => {
      expect(updateDisplayName).toHaveBeenCalledWith("token", "Alice");
    });
    expect(setUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Alice" }),
    );
    expect(screen.getByText(/Display name updated/i)).toBeInTheDocument();
  });

  it("allows languages update", async () => {
    const setUserMock = vi.fn();
    mockAuth({ setUser: setUserMock });
    vi.mocked(updateLanguages).mockResolvedValueOnce({
      id: "u1",
      email: "a@b.com",
      username: "alice",
      displayName: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
      languages: ["English", "Ukrainian"],
      createdAt: "2024-01-01T00:00:00Z",
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Add a language/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Add a language/i), "English");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));
    await userEvent.type(screen.getByPlaceholderText(/Add a language/i), "Ukrainian");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));
    await userEvent.click(screen.getByRole("button", { name: /Save languages/i }));

    await waitFor(() => {
      expect(updateLanguages).toHaveBeenCalledWith("token", ["English", "Ukrainian"]);
    });
    expect(setUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ languages: ["English", "Ukrainian"] }),
    );
    expect(screen.getByText(/Languages updated/i)).toBeInTheDocument();
  });

  it("prevents more than 5 languages on client", async () => {
    mockAuth();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Add a language/i)).toBeInTheDocument();
    });

    for (const lang of ["a", "b", "c", "d", "e"]) {
      await userEvent.type(screen.getByPlaceholderText(/Add a language/i), lang);
      await userEvent.click(screen.getByRole("button", { name: /Add/i }));
    }
    await userEvent.type(screen.getByPlaceholderText(/Add a language/i), "f");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));

    expect(await screen.findByText(/You can add up to 5 languages/i)).toBeInTheDocument();
  });

  it("deduplicates languages case-insensitively before submit", async () => {
    const setUserMock = vi.fn();
    mockAuth({ setUser: setUserMock });
    vi.mocked(updateLanguages).mockResolvedValueOnce({
      id: "u1",
      email: "a@b.com",
      username: "alice",
      displayName: null,
      avatarUrl: null,
      avatarUpdatedAt: null,
      languages: ["English"],
      createdAt: "2024-01-01T00:00:00Z",
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Add a language/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Add a language/i), "English");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));
    await userEvent.type(screen.getByPlaceholderText(/Add a language/i), "english");
    await userEvent.click(screen.getByRole("button", { name: /Add/i }));
    await userEvent.click(screen.getByRole("button", { name: /Save languages/i }));

    await waitFor(() => {
      expect(updateLanguages).toHaveBeenCalledWith("token", ["English"]);
    });
  });

  it("shows error on update failure", async () => {
    mockAuth();
    vi.mocked(updateDisplayName).mockRejectedValueOnce(new Error("Too long"));

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Your display name/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Your display name/i), "a".repeat(81));
    await userEvent.click(screen.getByRole("button", { name: /Save$/i }));

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
