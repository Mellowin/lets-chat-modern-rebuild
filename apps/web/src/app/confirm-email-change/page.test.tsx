import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ConfirmEmailChangePage, { ConfirmEmailChangeContent } from "./page";
import { confirmEmailChange } from "@/lib/auth-api";
import { useSearchParams } from "next/navigation";

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => ({ get: vi.fn((key: string) => (key === "token" ? "change-token-123" : null)) })),
}));

vi.mock("@/lib/auth-api", () => ({
  confirmEmailChange: vi.fn(),
}));

describe("ConfirmEmailChangePage — inner content", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn((key: string) => (key === "token" ? "change-token-123" : null)),
    } as unknown as ReturnType<typeof useSearchParams>);
  });

  it("shows success when token is valid", async () => {
    vi.mocked(confirmEmailChange).mockResolvedValueOnce({ success: true });

    render(<ConfirmEmailChangeContent />);

    expect(screen.getByText(/Loading/i)).toBeInTheDocument();

    expect(await screen.findByText(/Email changed successfully/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to sign in/i })).toHaveAttribute("href", "/login");
    expect(confirmEmailChange).toHaveBeenCalledWith({ token: "change-token-123" });
  });

  it("shows Ukrainian success message", async () => {
    localStorage.setItem("lets-chat:locale", "uk");
    vi.mocked(confirmEmailChange).mockResolvedValueOnce({ success: true });

    render(<ConfirmEmailChangeContent />);

    expect(await screen.findByText(/Email успішно змінено/i)).toBeInTheDocument();
  });

  it("shows error when token is invalid", async () => {
    vi.mocked(confirmEmailChange).mockRejectedValueOnce(new Error("Invalid or expired token"));

    render(<ConfirmEmailChangeContent />);

    expect(await screen.findByText(/Invalid or expired token/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to sign in/i })).toHaveAttribute("href", "/login");
  });

  it("shows error when token is missing", () => {
    vi.mocked(useSearchParams).mockReturnValue({
      get: vi.fn(() => null),
    } as unknown as ReturnType<typeof useSearchParams>);

    render(<ConfirmEmailChangeContent />);

    expect(screen.getByText(/Email change failed/i)).toBeInTheDocument();
    expect(confirmEmailChange).not.toHaveBeenCalled();
  });
});

describe("ConfirmEmailChangePage — Suspense wrapper", () => {
  it("renders without crashing", () => {
    render(<ConfirmEmailChangePage />);
    expect(screen.getByRole("heading", { name: /Confirm email change/i })).toBeInTheDocument();
  });
});
