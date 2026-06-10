import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import ProfilePage from "./page";
import { useAuth } from "@/lib/auth-context";
import { updateDisplayName, uploadAvatar, updateInterfaceLanguage, requestEmailChange, changePassword, listSessions, revokeAllSessions } from "@/lib/auth-api";

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
  requestEmailChange: vi.fn(),
  changePassword: vi.fn(),
  listSessions: vi.fn(),
  revokeAllSessions: vi.fn(),
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
      vi.mocked(listSessions).mockResolvedValue([]);
    });

  it("renders account information", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: "Alice", avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/Account information/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText("a@b.com")).toHaveLength(2);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows dash when displayName is null", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/Account information/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("shows avatar fallback when avatarUrl is null", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Avatar/i })).toBeInTheDocument();
    });

    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("shows existing avatar when avatarUrl exists", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: "/uploads/avatars/u1/test.png", avatarUpdatedAt: "2024-01-01T00:00:00Z", interfaceLanguage: "en", createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: /Avatar/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("img", { name: /Avatar/i })).toHaveAttribute("src", expect.stringContaining("/uploads/avatars/u1/test.png"));
  });

  it("shows Ukrainian avatar alt text", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: "/uploads/avatars/u1/test.png", avatarUpdatedAt: "2024-01-01T00:00:00Z", interfaceLanguage: "en", createdAt: "2024-01-01T00:00:00Z" },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Аватар" })).toBeInTheDocument();
    });
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

  it("shows Ukrainian error for unsupported avatar file type", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockAuth();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Аватар" })).toBeInTheDocument();
    });

    const file = new File(["gif"], "avatar.gif", { type: "image/gif" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("Дозволені лише зображення JPEG, PNG або WebP")).toBeInTheDocument();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it("shows Russian error for avatar file over 2 MB", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockAuth();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Аватар" })).toBeInTheDocument();
    });

    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "avatar.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    expect(await screen.findByText("Изображение должно быть 2 МБ или меньше")).toBeInTheDocument();
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
      interfaceLanguage: "en", createdAt: "2024-01-01T00:00:00Z",
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
      interfaceLanguage: "en", createdAt: "2024-01-01T00:00:00Z",
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

  it("shows Ukrainian fallback error when display name update rejects with non-Error", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    mockAuth();
    vi.mocked(updateDisplayName).mockImplementationOnce(() => Promise.reject("fallback"));

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Ваше відображуване імʼя/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Ваше відображуване імʼя/i), "A");
    await userEvent.click(screen.getByRole("button", { name: /Зберегти/i }));

    expect(await screen.findByText("Не вдалося оновити відображуване імʼя")).toBeInTheDocument();
  });

  it("shows Russian fallback error when avatar upload rejects with non-Error", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    mockAuth();
    vi.mocked(uploadAvatar).mockImplementationOnce(() => Promise.reject("fallback"));

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Аватар" })).toBeInTheDocument();
    });

    const file = new File(["png"], "avatar.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    expect(await screen.findByText("Не удалось загрузить аватар")).toBeInTheDocument();
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

    it("shows saved status when language API succeeds", async () => {
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
        expect(screen.getByText(/Мову збережено/i)).toBeInTheDocument();
      });
      expect(setUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ interfaceLanguage: "uk" }),
      );
      expect(localStorage.getItem("lets-chat:locale")).toBe("uk");
    });

    it("shows error and keeps current locale when API fails", async () => {
      localStorage.setItem("lets-chat:locale", "en");
      mockAuth();
      vi.mocked(updateInterfaceLanguage).mockRejectedValueOnce(new Error("Server error"));

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Українська" })).toBeInTheDocument();
      });

      expect(screen.getByText(/Selected: English/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Українська" }));

      await waitFor(() => {
        expect(screen.getByText(/Server error/i)).toBeInTheDocument();
      });

      expect(localStorage.getItem("lets-chat:locale")).toBe("en");
      expect(screen.getByText(/Selected: English/i)).toBeInTheDocument();
    });
  });

  describe("email change", () => {
    it("renders email change section with current email", async () => {
      mockAuth({
        user: { id: "u1", email: "old@example.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", createdAt: "2024-01-01T00:00:00Z" },
      });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Change email/i })).toBeInTheDocument();
      });

      expect(screen.getAllByText("old@example.com")).toHaveLength(2);
      expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Request change/i })).toBeInTheDocument();
    });

    it("submits new email and shows success", async () => {
      mockAuth();
      vi.mocked(requestEmailChange).mockResolvedValueOnce({ message: "Check your new email to confirm the change." });

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
      });

      await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), "new@example.com");
      await userEvent.click(screen.getByRole("button", { name: /Request change/i }));

      await waitFor(() => {
        expect(requestEmailChange).toHaveBeenCalledWith("token", { newEmail: "new@example.com" });
      });

      expect(await screen.findByText(/Check your new email to confirm the change/i)).toBeInTheDocument();
    });

    it("shows error on email change failure", async () => {
      mockAuth();
      vi.mocked(requestEmailChange).mockRejectedValueOnce(new Error("Email already in use"));

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
      });

      await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), "taken@example.com");
      await userEvent.click(screen.getByRole("button", { name: /Request change/i }));

      expect(await screen.findByText(/Email already in use/i)).toBeInTheDocument();
    });

    it("shows Ukrainian email change labels", async () => {
      localStorage.setItem("lets-chat:locale", "uk");
      mockAuth();

      render(<ProfilePage />);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Змінити email" })).toBeInTheDocument();
      });

      expect(screen.getByText(/Поточний email/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/korystuvach@pryklad.ua/i)).toBeInTheDocument();
    });
  });
});


describe("ProfilePage — change password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows validation error when new password and confirm do not match", async () => {
    mockAuth();
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Current password/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Current password"), "oldpass123");
    await userEvent.type(screen.getByPlaceholderText("New password"), "newpass123");
    await userEvent.type(screen.getByPlaceholderText("Confirm new password"), "different123");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));

    expect(await screen.findByText(/New passwords do not match/i)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("shows success message after successful password change", async () => {
    mockAuth();
    vi.mocked(changePassword).mockResolvedValueOnce({ success: true });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Current password/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Current password"), "oldpass123");
    await userEvent.type(screen.getByPlaceholderText("New password"), "newpass123");
    await userEvent.type(screen.getByPlaceholderText("Confirm new password"), "newpass123");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));

    expect(await screen.findByText(/Password changed successfully/i)).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledWith("token", {
      currentPassword: "oldpass123",
      newPassword: "newpass123",
    });
  });

  it("shows backend error when current password is wrong", async () => {
    mockAuth();
    vi.mocked(changePassword).mockRejectedValueOnce(new Error("Current password is incorrect"));

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Current password/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Current password"), "wrongpass");
    await userEvent.type(screen.getByPlaceholderText("New password"), "newpass123");
    await userEvent.type(screen.getByPlaceholderText("Confirm new password"), "newpass123");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));

    expect(await screen.findByText(/Current password is incorrect/i)).toBeInTheDocument();
  });
});

describe("ProfilePage — sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders sessions list with active and revoked statuses", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true },
      { id: "s2", createdAt: "2024-01-02T00:00:00Z", expiresAt: "2024-02-01T00:00:00Z", revokedAt: null, isActive: false },
      { id: "s3", createdAt: "2024-01-03T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: "2024-01-04T00:00:00Z", isActive: false },
    ]);

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Sessions/i })).toBeInTheDocument();
    });

    expect(await screen.findByText(/Active/i)).toBeInTheDocument();
    expect(screen.getByText(/Expired/i)).toBeInTheDocument();
    expect(screen.getByText(/Revoked/i)).toBeInTheDocument();
    expect(listSessions).toHaveBeenCalledWith("token");
  });

  it("shows error when sessions fail to load", async () => {
    mockAuth();
    vi.mocked(listSessions).mockRejectedValueOnce(new Error("Network error"));

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Sessions/i })).toBeInTheDocument();
    });

    expect(await screen.findByText(/Network error/i)).toBeInTheDocument();
  });

  it("shows no sessions message when list is empty", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([]);

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Sessions/i })).toBeInTheDocument();
    });

    expect(await screen.findByText(/No sessions found/i)).toBeInTheDocument();
  });

  it("revokes all sessions after confirm and calls logout", async () => {
    const logoutMock = vi.fn();
    mockAuth({ logout: logoutMock });
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true },
    ]);
    vi.mocked(revokeAllSessions).mockResolvedValueOnce({ success: true, revokedCount: 1 });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Revoke all sessions/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Revoke all sessions/i }));

    await waitFor(() => {
      expect(revokeAllSessions).toHaveBeenCalledWith("token");
    });
    expect(await screen.findByText(/All sessions revoked/i)).toBeInTheDocument();
    expect(logoutMock).toHaveBeenCalled();
  });

  it("does not revoke when confirm is cancelled", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true },
    ]);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Revoke all sessions/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Revoke all sessions/i }));

    expect(revokeAllSessions).not.toHaveBeenCalled();
  });

  it("shows error when revoke fails", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true },
    ]);
    vi.mocked(revokeAllSessions).mockRejectedValueOnce(new Error("Server error"));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Revoke all sessions/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Revoke all sessions/i }));

    expect(await screen.findByText(/Server error/i)).toBeInTheDocument();
  });
});
