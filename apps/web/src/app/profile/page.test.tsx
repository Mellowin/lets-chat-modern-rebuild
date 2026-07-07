import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import ProfilePage from "./page";
import { useAuth } from "@/lib/auth-context";
import { updateDisplayName, uploadAvatar, updateInterfaceLanguage, requestEmailChange, changePassword, listSessions, revokeOtherSessions, revokeSession } from "@/lib/auth-api";

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
  revokeOtherSessions: vi.fn(),
  revokeSession: vi.fn(),
  getNotificationPreferences: vi.fn().mockResolvedValue({
    pushNotificationsEnabled: true,
    mentionNotificationsEnabled: true,
    directMessageNotificationsEnabled: true,
    groupMessageNotificationsEnabled: true,
    channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE",
  }),
  updateNotificationPreferences: vi.fn().mockResolvedValue({
    pushNotificationsEnabled: true,
    mentionNotificationsEnabled: true,
    directMessageNotificationsEnabled: true,
    groupMessageNotificationsEnabled: true,
    channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE",
  }),
}));

function mockAuth(userOverrides?: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE", },
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

async function openTab(label: string) {
  const tab = screen.getByRole("button", { name: new RegExp(label, "i") });
  await userEvent.click(tab);
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

  it("renders tab navigation", async () => {
    mockAuth();
    render(<ProfilePage />);

    expect(screen.getByRole("button", { name: /Account/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Security/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sessions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Language/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Notifications/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /App install/i })).toBeInTheDocument();
  });

  it("shows account section by default", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: "Alice", avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE", },
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
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE", },
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/Account information/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("shows avatar fallback when avatarUrl is null", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE", },
    });

    render(<ProfilePage />);

    await openTab("Account");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Avatar/i })).toBeInTheDocument();
    });

    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("shows existing avatar when avatarUrl exists", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: "/uploads/avatars/u1/test.png", avatarUpdatedAt: "2024-01-01T00:00:00Z", interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE", },
    });

    render(<ProfilePage />);

    await openTab("Account");
    await waitFor(() => {
      expect(screen.getByRole("img", { name: /Avatar/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("img", { name: /Avatar/i })).toHaveAttribute("src", expect.stringContaining("/uploads/avatars/u1/test.png"));
  });

  it("rejects unsupported avatar file type on client", async () => {
    mockAuth();
    render(<ProfilePage />);

    await openTab("Account");
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

    await openTab("Account");
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
      interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE",
    });

    render(<ProfilePage />);

    await openTab("Account");
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
      interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE",
    });

    render(<ProfilePage />);

    await openTab("Account");
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Your display name/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Your display name/i), "Alice");
    await userEvent.click(screen.getByTestId("display-name-save"));

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

    await openTab("Account");
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Your display name/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Your display name/i), "a".repeat(81));
    await userEvent.click(screen.getByTestId("display-name-save"));

    expect(await screen.findByText(/Failed to update display name/i)).toBeInTheDocument();
  });

  it("has a back link to dashboard", async () => {
    mockAuth();
    render(<ProfilePage />);

    const link = screen.getByRole("link", { name: /Back to dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  describe("interface language", () => {
    it("renders interface language selector", async () => {
      mockAuth();
      render(<ProfilePage />);

      await openTab("Language");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
      });

      expect(screen.getByRole("button", { name: /Українська/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Русский/i })).toBeInTheDocument();
    });

    it("defaults to English when localStorage is empty", async () => {
      mockAuth();
      render(<ProfilePage />);

      await openTab("Language");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
      });

      const englishBtn = screen.getByRole("button", { name: "English" });
      expect(englishBtn).toHaveClass("bg-primary");
    });

    it("saves selected Ukrainian locale to localStorage", async () => {
      mockAuth();
      render(<ProfilePage />);

      await openTab("Language");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Українська/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /Українська/i }));

      expect(localStorage.getItem("lets-chat:locale")).toBe("uk");
      expect(screen.getByRole("button", { name: /Українська/i })).toHaveClass("bg-primary");
    });

    it("saves selected Russian locale to localStorage", async () => {
      mockAuth();
      render(<ProfilePage />);

      await openTab("Language");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Русский/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /Русский/i }));

      expect(localStorage.getItem("lets-chat:locale")).toBe("ru");
      expect(screen.getByRole("button", { name: /Русский/i })).toHaveClass("bg-primary");
    });

    it("updates selected language immediately", async () => {
      mockAuth();
      render(<ProfilePage />);

      await openTab("Language");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
      });

      expect(screen.getByText(/Selected: English/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /Українська/i }));

      expect(screen.getByText(/рано: Українська/i)).toBeInTheDocument();
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
        role: "USER",
        createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE",
      });

      render(<ProfilePage />);

      await openTab("Language");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Українська/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /Українська/i }));

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
        role: "USER",
        createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE",
      });

      render(<ProfilePage />);

      await openTab("Language");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Русский/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /Русский/i }));

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

      await openTab("Language");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Українська/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /Українська/i }));

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
        role: "USER",
        createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE",
      });

      render(<ProfilePage />);

      await openTab("Language");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Українська/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole("button", { name: /Українська/i }));

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

      await openTab("Language");
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Українська/i })).toBeInTheDocument();
      });

      expect(screen.getByText(/Selected: English/i)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /Українська/i }));

      await waitFor(() => {
        expect(screen.getByText(/Failed to save language preference/i)).toBeInTheDocument();
      });

      expect(localStorage.getItem("lets-chat:locale")).toBe("en");
      expect(screen.getByText(/Selected: English/i)).toBeInTheDocument();
    });
  });

  describe("notifications", () => {
    it("renders push notifications section", async () => {
      mockAuth();
      render(<ProfilePage />);

      await openTab("Notifications");
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Push notifications/i })).toBeInTheDocument();
      });
    });
  });

  describe("app install", () => {
    it("renders PWA install section", async () => {
      mockAuth();
      render(<ProfilePage />);

      await openTab("App install");
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /App install/i })).toBeInTheDocument();
      });
    });
  });

  it("shows change email in Security tab, not Account tab", async () => {
    mockAuth();
    render(<ProfilePage />);

    await openTab("Account");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Account information/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole("heading", { name: /Change email/i })).not.toBeInTheDocument();

    await openTab("Security");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Change email/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: /Change password/i })).toBeInTheDocument();
  });

  describe("email change", () => {
    it("renders email change section with current email", async () => {
      mockAuth({
        user: { id: "u1", email: "old@example.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en", role: "USER", createdAt: "2024-01-01T00:00:00Z",
      pushNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
      directMessageNotificationsEnabled: true,
      groupMessageNotificationsEnabled: true,
      channelMessageNotificationsEnabled: true,
      contactPrivacySetting: "EVERYONE", },
      });

      render(<ProfilePage />);

      await openTab("Security");
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Change email/i })).toBeInTheDocument();
      });

      expect(screen.getByText("old@example.com")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Request change/i })).toBeInTheDocument();
    });

    it("submits new email and shows success", async () => {
      mockAuth();
      vi.mocked(requestEmailChange).mockResolvedValueOnce({ message: "Check your new email to confirm the change." });

      render(<ProfilePage />);

      await openTab("Security");
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
      });

      await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), "new@example.com");
      await userEvent.click(screen.getByRole("button", { name: /Request change/i }));

      await waitFor(() => {
        expect(requestEmailChange).toHaveBeenCalledWith("token", { newEmail: "new@example.com" });
      });

      expect(await screen.findByText(/Check your new email to confirm the change/i)).toBeInTheDocument();
      expect(screen.getByText(/Only the latest confirmation email will work/i)).toBeInTheDocument();
    });

    it("shows error on email change failure", async () => {
      mockAuth();
      vi.mocked(requestEmailChange).mockRejectedValueOnce(new Error("Email already in use"));

      render(<ProfilePage />);

      await openTab("Security");
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument();
      });

      await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), "taken@example.com");
      await userEvent.click(screen.getByRole("button", { name: /Request change/i }));

      expect(await screen.findByText(/Email change failed/i)).toBeInTheDocument();
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

    await openTab("Security");
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

    await openTab("Security");
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

    await openTab("Security");
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Current password/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText("Current password"), "wrongpass");
    await userEvent.type(screen.getByPlaceholderText("New password"), "newpass123");
    await userEvent.type(screen.getByPlaceholderText("Confirm new password"), "newpass123");
    await userEvent.click(screen.getByRole("button", { name: /Change password/i }));

    expect(await screen.findByText(/Current password is incorrect/i)).toBeInTheDocument();
  });

  it("toggles password visibility for current password", async () => {
    mockAuth();
    render(<ProfilePage />);

    await openTab("Security");
    const field = screen.getByTestId("current-password-field");
    const toggle = screen.getByTestId("current-password-field-toggle");

    expect(field).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(toggle);
    expect(field).toHaveAttribute("type", "text");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(field).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles password visibility for new password", async () => {
    mockAuth();
    render(<ProfilePage />);

    await openTab("Security");
    const field = screen.getByTestId("new-password-field");
    const toggle = screen.getByTestId("new-password-field-toggle");

    expect(field).toHaveAttribute("type", "password");
    await userEvent.click(toggle);
    expect(field).toHaveAttribute("type", "text");
  });

  it("toggles password visibility for confirm password", async () => {
    mockAuth();
    render(<ProfilePage />);

    await openTab("Security");
    const field = screen.getByTestId("confirm-password-field");
    const toggle = screen.getByTestId("confirm-password-field-toggle");

    expect(field).toHaveAttribute("type", "password");
    await userEvent.click(toggle);
    expect(field).toHaveAttribute("type", "text");
  });

  it("password visibility toggle does not submit form", async () => {
    mockAuth();
    render(<ProfilePage />);

    await openTab("Security");
    const toggle = screen.getByTestId("current-password-field-toggle");

    await userEvent.click(toggle);
    expect(changePassword).not.toHaveBeenCalled();
  });
});

describe("ProfilePage — sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders sessions summary but hides list by default", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
      { id: "s2", createdAt: "2024-01-02T00:00:00Z", expiresAt: "2024-02-01T00:00:00Z", revokedAt: null, isActive: false, isCurrent: false, ipAddress: null, userAgent: null },
    ]);

    render(<ProfilePage />);

    await openTab("Sessions");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Sessions/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/Active sessions: 1/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show sessions/i })).toBeInTheDocument();
    expect(screen.queryByTestId("session-item-s1")).not.toBeInTheDocument();
    expect(listSessions).toHaveBeenCalledWith("token");
  });

  it("shows active sessions by default and inactive after toggle", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
      { id: "s2", createdAt: "2024-01-02T00:00:00Z", expiresAt: "2024-02-01T00:00:00Z", revokedAt: null, isActive: false, isCurrent: false, ipAddress: null, userAgent: null },
      { id: "s3", createdAt: "2024-01-03T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: "2024-01-04T00:00:00Z", isActive: false, isCurrent: false, ipAddress: null, userAgent: null },
    ]);

    render(<ProfilePage />);

    await openTab("Sessions");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Show sessions/i })).toBeInTheDocument();
    });

    const toggleButton = screen.getByRole("button", { name: /Show sessions/i });
    expect(toggleButton).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByTestId("session-item-s1")).toBeInTheDocument();
    });
    expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByTestId("session-item-s2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("session-item-s3")).not.toBeInTheDocument();

    const inactiveToggle = screen.getByRole("checkbox", { name: /Show revoked and expired sessions/i });
    await userEvent.click(inactiveToggle);

    await waitFor(() => {
      expect(screen.getByTestId("session-item-s2")).toBeInTheDocument();
      expect(screen.getByTestId("session-item-s3")).toBeInTheDocument();
    });
  });

  it("hides session list after clicking hide sessions", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
    ]);

    render(<ProfilePage />);

    await openTab("Sessions");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Show sessions/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Show sessions/i }));
    await waitFor(() => {
      expect(screen.getByTestId("session-item-s1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Hide sessions/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("session-item-s1")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Show sessions/i })).toBeInTheDocument();
  });

  it("shows error when sessions fail to load", async () => {
    mockAuth();
    vi.mocked(listSessions).mockRejectedValueOnce(new Error("Network error"));

    render(<ProfilePage />);

    await openTab("Sessions");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Sessions/i })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load sessions/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Active sessions:/i)).not.toBeInTheDocument();
  });

  it("shows no sessions message when list is empty", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([]);

    render(<ProfilePage />);

    await openTab("Sessions");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Sessions/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Show sessions/i }));

    await waitFor(() => {
      expect(screen.getByText(/No sessions found/i)).toBeInTheDocument();
    });
  });

  it("revokes an individual session after confirm and updates UI", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
      { id: "s2", createdAt: "2024-01-02T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
    ]);
    vi.mocked(revokeSession).mockResolvedValueOnce({ success: true });
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: new Date().toISOString(), isActive: false, isCurrent: false, ipAddress: null, userAgent: null },
      { id: "s2", createdAt: "2024-01-02T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
    ]);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ProfilePage />);

    await openTab("Sessions");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Show sessions/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Show sessions/i }));
    await waitFor(() => {
      expect(screen.getByTestId("session-item-s1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("revoke-session-s1"));

    await waitFor(() => {
      expect(revokeSession).toHaveBeenCalledWith("token", "s1");
    });
    expect(await screen.findByText(/Session revoked/i)).toBeInTheDocument();
    expect(screen.getByTestId("revoke-session-s2")).toBeInTheDocument();
    expect(screen.queryByTestId("revoke-session-s1")).not.toBeInTheDocument();
  });

  it("shows error when individual session revoke fails", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
    ]);
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
    ]);
    vi.mocked(revokeSession).mockRejectedValueOnce(new Error("Failed to revoke session"));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ProfilePage />);

    await openTab("Sessions");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Show sessions/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Show sessions/i }));
    await waitFor(() => {
      expect(screen.getByTestId("session-item-s1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("revoke-session-s1"));

    expect(await screen.findByText(/Failed to revoke session/i)).toBeInTheDocument();
  });

  it("does not revoke individual session when confirm is cancelled", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
    ]);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ProfilePage />);

    await openTab("Sessions");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Show sessions/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Show sessions/i }));
    await waitFor(() => {
      expect(screen.getByTestId("session-item-s1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId("revoke-session-s1"));

    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("revokes other sessions after confirm and refreshes list", async () => {
    const logoutMock = vi.fn();
    mockAuth({ logout: logoutMock });
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: true, ipAddress: null, userAgent: null },
      { id: "s2", createdAt: "2024-01-02T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
    ]);
    vi.mocked(revokeOtherSessions).mockResolvedValueOnce({ success: true, revokedCount: 1 });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ProfilePage />);

    await openTab("Sessions");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Revoke all other sessions/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Revoke all other sessions/i }));

    await waitFor(() => {
      expect(revokeOtherSessions).toHaveBeenCalledWith("token");
    });
    expect(await screen.findByText(/Other sessions revoked/i)).toBeInTheDocument();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it("does not revoke others when confirm is cancelled", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: true, ipAddress: null, userAgent: null },
      { id: "s2", createdAt: "2024-01-02T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
    ]);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ProfilePage />);

    await openTab("Sessions");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Revoke all other sessions/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Revoke all other sessions/i }));

    expect(revokeOtherSessions).not.toHaveBeenCalled();
  });

  it("shows error when revoke others fails", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: true, ipAddress: null, userAgent: null },
      { id: "s2", createdAt: "2024-01-02T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
    ]);
    vi.mocked(revokeOtherSessions).mockRejectedValueOnce(new Error("Server error"));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ProfilePage />);

    await openTab("Sessions");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Revoke all other sessions/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Revoke all other sessions/i }));

    expect(await screen.findByText(/Failed to revoke other sessions/i)).toBeInTheDocument();
  });

  it("disables revoke button for current session and shows badge", async () => {
    mockAuth();
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: "s1", createdAt: "2024-01-01T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: true, ipAddress: null, userAgent: null },
      { id: "s2", createdAt: "2024-01-02T00:00:00Z", expiresAt: "2025-01-01T00:00:00Z", revokedAt: null, isActive: true, isCurrent: false, ipAddress: null, userAgent: null },
    ]);
    vi.spyOn(window, "alert").mockReturnValue(undefined);

    render(<ProfilePage />);

    await openTab("Sessions");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Show sessions/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Show sessions/i }));
    await waitFor(() => {
      expect(screen.getByTestId("session-item-s1")).toBeInTheDocument();
    });

    expect(screen.getByText(/Current session/i)).toBeInTheDocument();
    expect(screen.queryByTestId("revoke-session-s1")).not.toBeInTheDocument();
    expect(screen.getByTestId("revoke-session-disabled-s1")).toBeInTheDocument();
    expect(screen.getByTestId("revoke-session-s2")).toBeInTheDocument();
  });
});
