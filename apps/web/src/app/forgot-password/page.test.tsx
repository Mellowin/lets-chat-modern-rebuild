import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import ForgotPasswordPage from "./page";
import { forgotPassword } from "@/lib/auth-api";

vi.mock("@/lib/auth-api", () => ({
  forgotPassword: vi.fn(),
}));

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it("renders forgot password form", () => {
    render(<ForgotPasswordPage />);

    expect(screen.getByRole("heading", { name: /Reset password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send reset link/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to sign in/i })).toHaveAttribute("href", "/login");
  });

  it("shows Ukrainian labels when locale is uk", () => {
    localStorage.setItem("lets-chat:locale", "uk");
    render(<ForgotPasswordPage />);

    expect(screen.getByRole("heading", { name: "Скидання пароля" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Надіслати посилання" })).toBeInTheDocument();
  });

  it("submits email and shows generic success message", async () => {
    vi.mocked(forgotPassword).mockResolvedValueOnce({ message: "If the email exists, a reset link has been sent." });

    render(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Send reset link/i }));

    await waitFor(() => {
      expect(forgotPassword).toHaveBeenCalledWith({ email: "user@example.com" });
    });

    expect(await screen.findByText(/If the email exists, a reset link has been sent/i)).toBeInTheDocument();
  });

  it("shows error on API failure", async () => {
    vi.mocked(forgotPassword).mockRejectedValueOnce(new Error("Network error"));

    render(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Send reset link/i }));

    expect(await screen.findByText(/Network error/i)).toBeInTheDocument();
  });

  it("disables submit while loading", async () => {
    let resolve: (value: unknown) => void;
    const promise = new Promise((r) => { resolve = r; });
    vi.mocked(forgotPassword).mockImplementationOnce(() => promise as Promise<never>);

    render(<ForgotPasswordPage />);

    await userEvent.type(screen.getByLabelText(/Email/i), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Send reset link/i }));

    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveTextContent(/Loading/i);

    resolve!({ message: "ok" });
  });
});
