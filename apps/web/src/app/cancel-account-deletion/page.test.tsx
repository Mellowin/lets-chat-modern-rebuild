import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CancelAccountDeletionPage from "./page";
import { cancelAccountDeletion } from "@/lib/auth-api";

vi.mock("@/lib/auth-api", () => ({
  cancelAccountDeletion: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: vi.fn(),
}));

import { useSearchParams } from "next/navigation";

describe("CancelAccountDeletionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("history", { replaceState: vi.fn() });
  });

  it("shows success state after cancelling", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams({ token: "valid-token" }) as unknown as ReturnType<
        typeof useSearchParams
      >,
    );
    vi.mocked(cancelAccountDeletion).mockResolvedValue({ success: true });

    render(<CancelAccountDeletionPage />);

    await waitFor(() => {
      expect(screen.getByTestId("cancel-account-deletion-card")).toHaveTextContent(/restored/i);
    });
  });

  it("shows error state when token is missing", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>,
    );

    render(<CancelAccountDeletionPage />);

    await waitFor(() => {
      expect(screen.getByTestId("cancel-account-deletion-card")).toHaveTextContent(/invalid/i);
    });
  });

  it("shows error state when cancellation fails", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams({ token: "invalid-token" }) as unknown as ReturnType<
        typeof useSearchParams
      >,
    );
    vi.mocked(cancelAccountDeletion).mockRejectedValue(new Error("invalid"));

    render(<CancelAccountDeletionPage />);

    await waitFor(() => {
      expect(screen.getByTestId("cancel-account-deletion-card")).toHaveTextContent(/invalid/i);
    });
  });
});
