import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { AccountDataSection } from "./AccountDataSection";
import { requestAccountDeletion, requestDataExport } from "@/lib/auth-api";
import { ApiError } from "@/lib/api-errors";

vi.mock("@/lib/auth-api", () => ({
  requestAccountDeletion: vi.fn(),
  requestDataExport: vi.fn(),
}));

vi.mock("@/lib/auth-fetch", () => ({
  AUTH_EVENTS: { SESSION_EXPIRED: "auth:session-expired" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const user = {
  id: "u1",
  email: "a@b.com",
  username: "alice",
  displayName: null,
  avatarUrl: null,
  avatarUpdatedAt: null,
  interfaceLanguage: "en" as const,
  role: "USER" as const,
  status: "ACTIVE" as const,
  isDeleted: false,
  createdAt: "2024-01-01T00:00:00Z",
  pushNotificationsEnabled: true,
  mentionNotificationsEnabled: true,
  directMessageNotificationsEnabled: true,
  groupMessageNotificationsEnabled: true,
  channelMessageNotificationsEnabled: true,
  contactPrivacySetting: "EVERYONE" as const,
};

describe("AccountDataSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders export and delete actions", () => {
    render(<AccountDataSection accessToken="token" user={user} />);
    expect(screen.getByTestId("download-data-button")).toBeInTheDocument();
    expect(screen.getByTestId("delete-account-button")).toBeInTheDocument();
  });

  it("opens export dialog and submits password", async () => {
    vi.mocked(requestDataExport).mockResolvedValue(new Blob(["{}"]));
    render(<AccountDataSection accessToken="token" user={user} />);

    await userEvent.click(screen.getByTestId("download-data-button"));
    expect(screen.getByTestId("export-password-input")).toBeInTheDocument();

    await userEvent.type(screen.getByTestId("export-password-input"), "password");
    await userEvent.click(screen.getByTestId("export-submit-button"));

    await waitFor(() => {
      expect(requestDataExport).toHaveBeenCalledWith("token", { currentPassword: "password" });
    });
  });

  it("opens delete dialog and rejects wrong confirmation phrase", async () => {
    render(<AccountDataSection accessToken="token" user={user} />);

    await userEvent.click(screen.getByTestId("delete-account-button"));
    expect(screen.getByTestId("delete-password-input")).toBeInTheDocument();

    await userEvent.type(screen.getByTestId("delete-password-input"), "password");
    await userEvent.type(screen.getByTestId("delete-phrase-input"), "wrong phrase");
    await userEvent.click(screen.getByTestId("delete-submit-button"));

    expect(requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("shows ownership blockers when delete request is blocked", async () => {
    vi.mocked(requestAccountDeletion).mockRejectedValue(
      new ApiError(
        403,
        "ACCOUNT_DELETION_OWNERSHIP_BLOCKED",
        "Transfer workspace and group ownership before deleting your account",
        {
          workspaces: [{ id: "ws-1", name: "Blocked Workspace", slug: "blocked-ws" }],
          groups: [{ id: "grp-1", name: "Blocked Group", memberId: "m-1" }],
        },
      ),
    );

    render(<AccountDataSection accessToken="token" user={user} />);

    await userEvent.click(screen.getByTestId("delete-account-button"));
    await userEvent.type(screen.getByTestId("delete-password-input"), "password");
    await userEvent.type(screen.getByTestId("delete-phrase-input"), "DELETE MY ACCOUNT");
    await userEvent.click(screen.getByTestId("delete-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("delete-account-blockers")).toBeInTheDocument();
    });
    expect(screen.getByText("Blocked Workspace")).toBeInTheDocument();
    expect(screen.getByText("Blocked Group")).toBeInTheDocument();
  });
});
