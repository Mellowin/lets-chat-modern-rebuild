import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import LoginPage from "./page";
import { login, resendVerification, ApiTimeoutError } from "@/lib/auth-api";
import { createAuthUser } from "@/test/factories";

const pushMock = vi.fn();
const loginSuccessMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/auth-api", () => {
  class ApiTimeoutError extends Error {
    constructor(message = "Request timed out") {
      super(message);
      this.name = "ApiTimeoutError";
    }
  }
  return {
    login: vi.fn(),
    resendVerification: vi.fn(),
    ApiTimeoutError,
    isApiTimeoutError: (err: unknown) => err instanceof ApiTimeoutError,
  };
});

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ loginSuccess: loginSuccessMock }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it("renders login form", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: /Sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create one/i })).toHaveAttribute("href", "/register");
  });

  it("shows Ukrainian login labels when locale is uk", () => {
    localStorage.setItem("lets-chat:locale", "uk");
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Увійти" })).toBeInTheDocument();
    expect(screen.getByText(/Раді бачити вас знову/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("korystuvach@pryklad.ua")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Увійти" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Створити" })).toHaveAttribute("href", "/register");
  });

  it("shows Russian login labels when locale is ru", () => {
    localStorage.setItem("lets-chat:locale", "ru");
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Войти" })).toBeInTheDocument();
    expect(screen.getByText("Рады видеть вас снова. Введите свои данные.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("polzovatel@primer.ru")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
  });

  it("shows Russian validation error for empty submit", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    render(<LoginPage />);

    fireEvent.submit(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("Email и пароль обязательны")).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows Russian loading button while submitting", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    let resolveLogin: (value: unknown) => void;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });
    vi.mocked(login).mockImplementationOnce(() => loginPromise as Promise<never>);

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/^Пароль$/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(screen.getByRole("button", { name: "Входим…" })).toHaveTextContent("Входим…");
    expect(screen.getByRole("button", { name: "Входим…" })).toBeDisabled();

    await act(async () => {
      resolveLogin!({
        user: createAuthUser(),
        accessToken: "at",
        refreshToken: "rt",
      });
    });

    await waitFor(() => {
      expect(loginSuccessMock).toHaveBeenCalled();
    });
  });

  it("shows error on empty submit without calling login", async () => {
    render(<LoginPage />);

    fireEvent.submit(screen.getByRole("button", { name: /Sign in/i }));

    expect(await screen.findByText(/Email and password are required/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("calls login and redirects on success", async () => {
    const mockResult = {
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en" as const, createdAt: "2024-01-01T00:00:00Z" },
      accessToken: "at",
      refreshToken: "rt",
    };
    vi.mocked(login).mockResolvedValueOnce(mockResult);

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "  a@b.com  ");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({ email: "a@b.com", password: "secret" });
    });

    expect(loginSuccessMock).toHaveBeenCalledWith(mockResult);
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("shows backend error and does not redirect", async () => {
    vi.mocked(login).mockRejectedValueOnce(new Error("Invalid credentials"));

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(await screen.findByText(/Invalid credentials/i)).toBeInTheDocument();
    expect(loginSuccessMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows unverified email message with resend option", async () => {
    vi.mocked(login).mockRejectedValueOnce(new Error("Email not verified"));

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(await screen.findByText(/Please verify your email before signing in/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resend verification email/i })).toBeInTheDocument();
    expect(loginSuccessMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("resends verification email from unverified state and shows generic success", async () => {
    vi.mocked(login).mockRejectedValueOnce(new Error("Email not verified"));
    vi.mocked(resendVerification).mockResolvedValueOnce({
      message: "If the email exists and is not verified, a verification email has been sent.",
    });

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(await screen.findByText(/Please verify your email before signing in/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Resend verification email/i }));

    await waitFor(() => {
      expect(resendVerification).toHaveBeenCalledWith({ email: "a@b.com" });
    });

    expect(await screen.findByText(/If the email exists and is not verified/i)).toBeInTheDocument();
  });

  it("shows loading state while submitting", async () => {
    let resolveLogin: (value: unknown) => void;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });
    vi.mocked(login).mockImplementationOnce(() => loginPromise as Promise<never>);

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(screen.getByRole("button", { name: /Signing in…/i })).toHaveTextContent(/Signing in…/i);
    expect(screen.getByRole("button", { name: /Signing in…/i })).toBeDisabled();

    await act(async () => {
      resolveLogin!({
        user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en" as const, createdAt: "2024-01-01T00:00:00Z" },
        accessToken: "at",
        refreshToken: "rt",
      });
    });

    await waitFor(() => {
      expect(loginSuccessMock).toHaveBeenCalled();
    });
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("stops loading and shows timeout message on ApiTimeoutError", async () => {
    vi.mocked(login).mockRejectedValueOnce(new ApiTimeoutError());

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(await screen.findByText(/taking too long to respond/i)).toBeInTheDocument();
    expect(screen.getByText(/Free Render instances may take up to a minute/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign in/i })).toHaveTextContent(/Sign in/i);
    expect(screen.getByRole("button", { name: /Sign in/i })).not.toBeDisabled();
    expect(loginSuccessMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("allows retry after timeout error", async () => {
    vi.mocked(login)
      .mockRejectedValueOnce(new ApiTimeoutError())
      .mockResolvedValueOnce({
        user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en" as const, createdAt: "2024-01-01T00:00:00Z" },
        accessToken: "at",
        refreshToken: "rt",
      });

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(await screen.findByText(/taking too long to respond/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    await waitFor(() => {
      expect(loginSuccessMock).toHaveBeenCalled();
    });
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });
});
