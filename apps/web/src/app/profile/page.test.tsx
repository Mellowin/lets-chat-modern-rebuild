import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import ProfilePage from "./page";
import { useAuth } from "@/lib/auth-context";
import { updateDisplayName, uploadAvatar, updateInterfaceLanguage } from "@/lib/auth-api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/auth-api", () => ({
  updateDisplayName: vi.fn(),
  uploadAvatar: vi.fn(),
  updateInterfaceLanguage: vi.fn(),
}));

function mockAuth(userOverrides?: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", createdAt: "2024-01-01T00:00:00Z" },
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
    localStorage.clear();
  });

  it("renders account information", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: "Alice", avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
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
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/Account information/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("shows avatar fallback when avatarUrl is null", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Avatar/i })).toBeInTheDocument();
    });

    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("shows existing avatar when avatarUrl exists", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: "/uploads/avatars/u1/test.png", avatarUpdatedAt: "2024-01-01T00:00:00Z", createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: /Avatar/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("img", { name: /Avatar/i })).toHaveAttribute("src", expect.stringContaining("/uploads/avatars/u1/test.png"));
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
      createdAt: "2024-01-01T00:00:00Z",
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Your display name/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Your display name/i), "Alice");
    await userEvent.click(screen.getByRole("button", { name: /^Save$/i }));

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
    await userEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    expect(await screen.findByText(/Too long/i)).toBeInTheDocument();
  });

  it("has a back link to dashboard", async () => {
    mockAuth();
    render(<ProfilePage />);

    const link = screen.getByRole("link", { name: /Back to dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  describe("interface language", () => {
    it("does not render old Add a language input", async () => {
      mockAuth();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText(/Interface language/i)).toBeInTheDocument();
      });

      expect(screen.queryByPlaceholderText(/Add a language/i)).not.toBeInTheDocument();
    });

    it("does not render old Save languages button", async () => {
      mockAuth();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText(/Interface language/i)).toBeInTheDocument();
      });

      expect(screen.queryByRole("button", { name: /Save languages/i })).not.toBeInTheDocument();
    });

    it("renders interface language selector", async () => {
      mockAuth();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: "Українська" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Русский" })).toBeInTheDocument();
    });

    it("defaults to English when localStorage is empty", async () => {
      mockAuth();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByText(/Interface language/i)).toBeInTheDocument();
      });

      const englishBtn = screen.getByRole("button", { name: "English" });
      expect(englishBtn).toHaveClass("bg-zinc-900");
    });

    it("saves selected Ukrainian locale to localStorage", async () => {
      mockAuth();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Українська" })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "Українська" }));

      expect(localStorage.getItem("lets-chat:locale")).toBe("uk");
      expect(screen.getByRole("button", { name: "Українська" })).toHaveClass("bg-zinc-900");
    });

    it("saves selected Russian locale to localStorage", async () => {
      mockAuth();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Русский" })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "Русский" }));

      expect(localStorage.getItem("lets-chat:locale")).toBe("ru");
      expect(screen.getByRole("button", { name: "Русский" })).toHaveClass("bg-zinc-900");
    });

    it("updates selected language immediately", async () => {
      mockAuth();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
      });

      expect(screen.getByText(/Selected: English/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Українська" }));

      expect(screen.getByText(/Обрано: Українська/i)).toBeInTheDocument();
    });

    it("shows Ukrainian labels after selecting Ukrainian", async () => {
      mockAuth();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Українська" })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "Українська" }));

      expect(screen.getByRole("heading", { name: "Профіль" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Назад до панелі/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Інформація акаунта" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Аватар" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Завантажити аватар" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Редагувати відображуване імʼя" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Мова інтерфейсу" })).toBeInTheDocument();
    });

    it("shows Russian labels after selecting Russian", async () => {
      mockAuth();
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Русский" })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "Русский" }));

      expect(screen.getByRole("heading", { name: "Профиль" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Назад к панели/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Информация аккаунта" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Аватар" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Загрузить аватар" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Редактировать отображаемое имя" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Язык интерфейса" })).toBeInTheDocument();
    });

    it("calls updateInterfaceLanguage API when authenticated user selects Ukrainian", async () => {
      const setUserMock = vi.fn();
      mockAuth({ setUser: setUserMock });
      vi.mocked(updateInterfaceLanguage).mockResolvedValueOnce({
        id: "u1",
        email: "a@b.com",
        username: "alice",
        displayName: null,
        avatarUrl: null,
        avatarUpdatedAt: null,
        interfaceLanguage: "uk",
        createdAt: "2024-01-01T00:00:00Z",
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Українська" })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "Українська" }));

      await waitFor(() => {
        expect(updateInterfaceLanguage).toHaveBeenCalledWith("token", "uk");
      });
      expect(setUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ interfaceLanguage: "uk" }),
      );
      expect(localStorage.getItem("lets-chat:locale")).toBe("uk");
    });

    it("calls updateInterfaceLanguage API when authenticated user selects Russian", async () => {
      const setUserMock = vi.fn();
      mockAuth({ setUser: setUserMock });
      vi.mocked(updateInterfaceLanguage).mockResolvedValueOnce({
        id: "u1",
        email: "a@b.com",
        username: "alice",
        displayName: null,
        avatarUrl: null,
        avatarUpdatedAt: null,
        interfaceLanguage: "ru",
        createdAt: "2024-01-01T00:00:00Z",
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Русский" })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "Русский" }));

      await waitFor(() => {
        expect(updateInterfaceLanguage).toHaveBeenCalledWith("token", "ru");
      });
      expect(setUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ interfaceLanguage: "ru" }),
      );
      expect(localStorage.getItem("lets-chat:locale")).toBe("ru");
    });

    it("falls back to localStorage-only when no accessToken", async () => {
      mockAuth({ accessToken: null });
      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Українська" })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: "Українська" }));

      expect(updateInterfaceLanguage).not.toHaveBeenCalled();
      expect(localStorage.getItem("lets-chat:locale")).toBe("uk");
    });
  });
});
