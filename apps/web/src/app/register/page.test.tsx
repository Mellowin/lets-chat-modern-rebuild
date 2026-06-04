import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import RegisterPage from "./page";
import { register } from "@/lib/auth-api";

const pushMock = vi.fn();
const loginSuccessMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/auth-api", () => ({
  register: vi.fn(),
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
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
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
    await userEvent.type(screen.getByLabelText(/Пароль/i), "password123");
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
    await userEvent.type(screen.getByLabelText(/Password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    expect(await screen.findByText(/Username can only contain letters, numbers and underscores/i)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("calls register and redirects on success", async () => {
    const mockResult = {
      user: { id: "u2", email: "new@example.com", username: "bob", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en" as const, createdAt: "2024-01-01T00:00:00Z" },
      accessToken: "at2",
      refreshToken: "rt2",
    };
    vi.mocked(register).mockResolvedValueOnce(mockResult);

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "  new@example.com  ");
    await userEvent.type(screen.getByLabelText(/Username/i), "  bob  ");
    await userEvent.type(screen.getByLabelText(/Password/i), "securepass");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        email: "new@example.com",
        username: "bob",
        password: "securepass",
      });
    });

    expect(loginSuccessMock).toHaveBeenCalledWith(mockResult);
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("calls register with Cyrillic username and redirects on success", async () => {
    const mockResult = {
      user: { id: "u3", email: "cyr@example.com", username: "Валера", displayName: null, avatarUrl: null, avatarUpdatedAt: null, interfaceLanguage: "en" as const, createdAt: "2024-01-01T00:00:00Z" },
      accessToken: "at3",
      refreshToken: "rt3",
    };
    vi.mocked(register).mockResolvedValueOnce(mockResult);

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "cyr@example.com");
    await userEvent.type(screen.getByLabelText(/Username/i), "Валера");
    await userEvent.type(screen.getByLabelText(/Password/i), "securepass");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        email: "cyr@example.com",
        username: "Валера",
        password: "securepass",
      });
    });

    expect(loginSuccessMock).toHaveBeenCalledWith(mockResult);
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("shows backend error and does not redirect", async () => {
    vi.mocked(register).mockRejectedValueOnce(new Error("Email already in use"));

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "taken@example.com");
    await userEvent.type(screen.getByLabelText(/Username/i), "alice");
    await userEvent.type(screen.getByLabelText(/Password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    expect(await screen.findByText(/Email already in use/i)).toBeInTheDocument();
    expect(loginSuccessMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
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
    await userEvent.type(screen.getByLabelText(/Password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /Create account/i }));

    expect(screen.getByRole("button")).toHaveTextContent(/Creating account…/i);
    expect(screen.getByRole("button")).toBeDisabled();

    resolveRegister!({
      user: { id: "u1", email: "a@b.com", username: "alice", createdAt: "2024-01-01T00:00:00Z" },
      accessToken: "at",
      refreshToken: "rt",
    });

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent(/Create account/i);
    });
  });
});
