import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import ResetPasswordPage, { ResetPasswordContent } from "./page";
import { resetPassword } from "@/lib/auth-api";
import { useSearchParams } from "next/navigation";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: vi.fn(() => ({ get: vi.fn((key: string) => (key === "token" ? "reset-token-123" : null)) })),
}));

vi.mock("@/lib/auth-api", () => ({
  resetPassword: vi.fn(),
}));

describe("ResetPasswordPage — inner content", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn((key: string) => (key === "token" ? "reset-token-123" : null)),
    } as unknown as ReturnType<typeof useSearchParams>);
  });

  it("renders reset password form", () => {
    render(<ResetPasswordContent />);

    expect(screen.getByRole("heading", { name: /Set new password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/New password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send reset link/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to sign in/i })).toHaveAttribute("href", "/login");
  });

  it("shows Ukrainian labels when locale is uk", () => {
    localStorage.setItem("lets-chat:locale", "uk");
    render(<ResetPasswordContent />);

    expect(screen.getByRole("heading", { name: "Новий пароль" })).toBeInTheDocument();
    expect(screen.getByLabelText("Новий пароль")).toBeInTheDocument();
  });

  it("shows error when passwords do not match", async () => {
    render(<ResetPasswordContent />);

    await userEvent.type(screen.getByLabelText(/New password/i), "password1");
    await userEvent.type(screen.getByLabelText(/Confirm password/i), "password2");
    await userEvent.click(screen.getByRole("button", { name: /Send reset link/i }));

    expect(await screen.findByText(/Passwords do not match/i)).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("shows error when password is too short", async () => {
    render(<ResetPasswordContent />);

    await userEvent.type(screen.getByLabelText(/New password/i), "short");
    await userEvent.type(screen.getByLabelText(/Confirm password/i), "short");
    await userEvent.click(screen.getByRole("button", { name: /Send reset link/i }));

    expect(await screen.findByText(/Password must be at least 8 characters/i)).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("submits reset and shows success with redirect link", async () => {
    vi.mocked(resetPassword).mockResolvedValueOnce({ success: true });

    render(<ResetPasswordContent />);

    await userEvent.type(screen.getByLabelText(/New password/i), "newpassword123");
    await userEvent.type(screen.getByLabelText(/Confirm password/i), "newpassword123");
    await userEvent.click(screen.getByRole("button", { name: /Send reset link/i }));

    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith({ token: "reset-token-123", password: "newpassword123" });
    });

    expect(await screen.findByText(/Password reset successfully/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to sign in/i })).toHaveAttribute("href", "/login");
  });

  it("shows error on API failure", async () => {
    vi.mocked(resetPassword).mockRejectedValueOnce(new Error("Invalid or expired token"));

    render(<ResetPasswordContent />);

    await userEvent.type(screen.getByLabelText(/New password/i), "newpassword123");
    await userEvent.type(screen.getByLabelText(/Confirm password/i), "newpassword123");
    await userEvent.click(screen.getByRole("button", { name: /Send reset link/i }));

    expect(await screen.findByText(/Invalid or expired token/i)).toBeInTheDocument();
  });

  it("shows error when token is missing", async () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(() => null),
    } as unknown as ReturnType<typeof useSearchParams>);

    render(<ResetPasswordContent />);

    expect(await screen.findByText(/Password reset failed/i)).toBeInTheDocument();
  });

  it("redirects after success", async () => {
    vi.mocked(resetPassword).mockResolvedValueOnce({ success: true });

    render(<ResetPasswordContent />);

    await userEvent.type(screen.getByLabelText(/New password/i), "newpassword123");
    await userEvent.type(screen.getByLabelText(/Confirm password/i), "newpassword123");
    await userEvent.click(screen.getByRole("button", { name: /Send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/Password reset successfully/i)).toBeInTheDocument();
    });

    // setTimeout is used in component; verify push was called after delay
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/login");
    }, { timeout: 5000 });
  });
});

describe("ResetPasswordPage — Suspense wrapper", () => {
  it("renders without crashing", () => {
    render(<ResetPasswordPage />);
    expect(screen.getByRole("heading", { name: /Set new password/i })).toBeInTheDocument();
  });
});
