import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import LoginPage from "./page";
import { login } from "@/lib/auth-api";

const pushMock = vi.fn();
const loginSuccessMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/auth-api", () => ({
  login: vi.fn(),
}));

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
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create one/i })).toHaveAttribute("href", "/register");
  });

  it("shows Ukrainian login labels when locale is uk", () => {
    localStorage.setItem("lets-chat:locale", "uk");
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "Увійти" })).toBeInTheDocument();
    expect(screen.getByText(/Раді бачити вас знову/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Увійти" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Створити" })).toHaveAttribute("href", "/register");
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
    await userEvent.type(screen.getByLabelText(/Пароль/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(screen.getByRole("button")).toHaveTextContent("Входим…");
    expect(screen.getByRole("button")).toBeDisabled();

    await act(async () => {
      resolveLogin!({
        user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
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
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
      accessToken: "at",
      refreshToken: "rt",
    };
    vi.mocked(login).mockResolvedValueOnce(mockResult);

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "  a@b.com  ");
    await userEvent.type(screen.getByLabelText(/Password/i), "secret");
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
    await userEvent.type(screen.getByLabelText(/Password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(await screen.findByText(/Invalid credentials/i)).toBeInTheDocument();
    expect(loginSuccessMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("shows loading state while submitting", async () => {
    let resolveLogin: (value: unknown) => void;
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve;
    });
    vi.mocked(login).mockImplementationOnce(() => loginPromise as Promise<never>);

    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "a@b.com");
    await userEvent.type(screen.getByLabelText(/Password/i), "secret");
    await userEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(screen.getByRole("button")).toHaveTextContent(/Signing in…/i);
    expect(screen.getByRole("button")).toBeDisabled();

    await act(async () => {
      resolveLogin!({
        user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
        accessToken: "at",
        refreshToken: "rt",
      });
    });

    await waitFor(() => {
      expect(loginSuccessMock).toHaveBeenCalled();
    });
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });
});
