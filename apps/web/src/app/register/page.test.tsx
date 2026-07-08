import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import RegisterPage from "./page";
import { register, resendVerification } from "@/lib/auth-api";

const pushMock = vi.fn();
const loginSuccessMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/auth-api", () => ({
  register: vi.fn(),
  resendVerification: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ loginSuccess: loginSuccessMock }),
}));

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders register form", () => {
    render(<RegisterPage />);

    expect(screen.getByRole("heading", { name: /Create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText(/Username/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("john_doe")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create account/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in/i })).toHaveAttribute("href", "/login");
  });

  it("shows Ukrainian register labels when locale is uk", () => {
    localStorage.setItem("lets-chat:locale", "uk");
    render(<RegisterPage />);

    expect(screen.getByRole("heading", { name: "Створити акаунт" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Імʼя користувача/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("korystuvach@pryklad.ua")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("ivan_petrenko")).toBeInTheDocument();
    expect(screen.getByText(/Мінімум 8 символів/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Увійти" })).toHaveAttribute("href", "/login");
  });

  it("shows Russian register placeholders when locale is ru", () => {
    localStorage.setItem("lets-chat:locale", "ru");
    render(<RegisterPage />);

    expect(screen.getByPlaceholderText("polzovatel@primer.ru")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("ivan_ivanov")).toBeInTheDocument();
  });

  it("shows Russian validation error for empty submit", async () => {
    localStorage.setItem("lets-chat:locale", "ru");
    render(<RegisterPage />);

    fireEvent.submit(screen.getByRole("button", { name: "Создать аккаунт" }));

    expect(await screen.findByText("Все поля обязательны")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows Ukrainian invalid username error", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "test@example.com");
    await userEvent.type(screen.getByLabelText(/Імʼя користувача/i), "invalid user!");
    await userEvent.type(screen.getByLabelText(/^Пароль$/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Створити акаунт" }));

    expect(await screen.findByText("Імʼя користувача може містити лише літери, цифри та підкреслення")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("shows error on empty submit without calling register", async () => {
    render(<RegisterPage />);

    fireEvent.submit(screen.getByRole("button", { name: /Create account/i }));

    expect(await screen.findByText(/All fields are required/i)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows error for invalid username format", async () => {
    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "test@example.com");
    await userEvent.type(screen.getByLabelText(/Username/i), "invalid user!");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    expect(await screen.findByText(/Username can only contain letters, numbers and underscores/i)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("shows check-your-email state on successful registration and does not store tokens or redirect", async () => {
    vi.mocked(register).mockResolvedValueOnce({ requiresEmailVerification: true, email: "new@example.com" });

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "  new@example.com  ");
    await userEvent.type(screen.getByLabelText(/Username/i), "  bob  ");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "securepass");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        email: "new@example.com",
        username: "bob",
        password: "securepass",
      });
    });

    expect(await screen.findByText(/Check your email to verify your account/i)).toBeInTheDocument();
    expect(screen.getByText(/new@example.com/)).toBeInTheDocument();
    expect(loginSuccessMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("calls register with Cyrillic username and shows check-email state", async () => {
    vi.mocked(register).mockResolvedValueOnce({ requiresEmailVerification: true, email: "cyr@example.com" });

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "cyr@example.com");
    await userEvent.type(screen.getByLabelText(/Username/i), "Валера");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "securepass");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        email: "cyr@example.com",
        username: "Валера",
        password: "securepass",
      });
    });

    expect(await screen.findByText(/Check your email to verify your account/i)).toBeInTheDocument();
    expect(loginSuccessMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows backend error and does not redirect", async () => {
    vi.mocked(register).mockRejectedValueOnce(new Error("Email already in use"));

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "taken@example.com");
    await userEvent.type(screen.getByLabelText(/Username/i), "alice");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    expect(await screen.findByText(/Registration failed/i)).toBeInTheDocument();
    expect(loginSuccessMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows registration unavailable for MAIL_PROVIDER_QUOTA_EXCEEDED", async () => {
    vi.mocked(register).mockRejectedValueOnce(
      new Error(
        "MAIL_PROVIDER_QUOTA_EXCEEDED: Email delivery is temporarily unavailable. Please try again later.",
      ),
    );

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "quota@example.com");
    await userEvent.type(screen.getByLabelText(/Username/i), "alice");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    expect(
      await screen.findByText(/Registration is temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Registration failed/i)).not.toBeInTheDocument();
    expect(loginSuccessMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows registration unavailable for safe backend message", async () => {
    vi.mocked(register).mockRejectedValueOnce(
      new Error(
        "Email delivery is temporarily unavailable. Please try again later.",
      ),
    );

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "quota2@example.com");
    await userEvent.type(screen.getByLabelText(/Username/i), "alice");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    expect(
      await screen.findByText(/Registration is temporarily unavailable/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Registration failed/i)).not.toBeInTheDocument();
  });

  it("shows loading state while submitting", async () => {
    let resolveRegister: (value: unknown) => void;
    const registerPromise = new Promise((resolve) => {
      resolveRegister = resolve;
    });
    vi.mocked(register).mockImplementationOnce(() => registerPromise as Promise<never>);

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/Username/i), "alice");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    expect(screen.getByRole("button", { name: /Creating account…/i })).toHaveTextContent(/Creating account…/i);
    expect(screen.getByRole("button", { name: /Creating account…/i })).toBeDisabled();

    resolveRegister!({ requiresEmailVerification: true, email: "a@b.com" });

    await waitFor(() => {
      expect(screen.getByText(/Check your email to verify your account/i)).toBeInTheDocument();
    });
  });

  it("resends verification email from success state", async () => {
    vi.mocked(register).mockResolvedValueOnce({ requiresEmailVerification: true, email: "new@example.com" });
    vi.mocked(resendVerification).mockResolvedValueOnce({
      message: "If the email exists and is not verified, a verification email has been sent.",
    });

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "new@example.com");
    await userEvent.type(screen.getByLabelText(/Username/i), "bob");
    await userEvent.type(screen.getByLabelText(/^Password$/i), "securepass");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/Check your email to verify your account/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Resend verification email/i }));

    await waitFor(() => {
      expect(resendVerification).toHaveBeenCalledWith({ email: "new@example.com" });
    });

    expect(await screen.findByText(/If the email exists and is not verified/i)).toBeInTheDocument();
  });
});
