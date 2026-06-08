import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import VerifyEmailContent from "./verify-email-content";
import { verifyEmail, resendVerification } from "@/lib/auth-api";
import { useSearchParams } from "next/navigation";

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => ({ get: vi.fn((key: string) => (key === "token" ? "test-token-123" : null)) })),
}));

vi.mock("@/lib/auth-api", () => ({
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
}));

describe("VerifyEmailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn((key: string) => (key === "token" ? "test-token-123" : null)),
    } as unknown as ReturnType<typeof useSearchParams>);
  });

  it("shows success when token is valid", async () => {
    vi.mocked(verifyEmail).mockResolvedValueOnce({ success: true });

    render(<VerifyEmailContent />);

    expect(await screen.findByText(/Email verified successfully/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in/i })).toHaveAttribute("href", "/login");
    expect(verifyEmail).toHaveBeenCalledWith({ token: "test-token-123" });
  });

  it("shows failure when token is invalid", async () => {
    vi.mocked(verifyEmail).mockRejectedValueOnce(new Error("Invalid or expired verification token"));

    render(<VerifyEmailContent />);

    expect(await screen.findByText(/Invalid or expired verification token/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resend verification email/i })).toBeInTheDocument();
  });

  it("resends verification email and shows success", async () => {
    vi.mocked(verifyEmail).mockRejectedValueOnce(new Error("Invalid or expired verification token"));
    vi.mocked(resendVerification).mockResolvedValueOnce({
      message: "If the email exists and is not verified, a verification email has been sent.",
    });

    render(<VerifyEmailContent />);

    expect(await screen.findByText(/Invalid or expired verification token/i)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), "user@example.com");
    await userEvent.click(screen.getByRole("button", { name: /Resend verification email/i }));

    await waitFor(() => {
      expect(resendVerification).toHaveBeenCalledWith({ email: "user@example.com" });
    });

    expect(await screen.findByText(/If the email exists and is not verified/i)).toBeInTheDocument();
  });

  it("shows missing token message when no token in URL", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(() => null),
    } as unknown as ReturnType<typeof useSearchParams>);

    render(<VerifyEmailContent />);

    expect(screen.getByText(/Invalid or missing verification link/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to sign in/i })).toHaveAttribute("href", "/login");
  });
});
