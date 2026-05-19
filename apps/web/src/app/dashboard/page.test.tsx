import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import DashboardPage from "./page";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaces, archiveWorkspace, listArchivedWorkspaces, restoreWorkspace } from "@/lib/workspaces-api";
import { updateDisplayName } from "@/lib/auth-api";
import { getPendingInvites, acceptInvite, declineInvite } from "@/lib/invites-api";

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/workspaces-api", () => ({
  getWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  archiveWorkspace: vi.fn(),
  listArchivedWorkspaces: vi.fn(),
  restoreWorkspace: vi.fn(),
}));

vi.mock("@/lib/auth-api", () => ({
  updateDisplayName: vi.fn(),
}));

vi.mock("@/lib/invites-api", () => ({
  getPendingInvites: vi.fn(),
  acceptInvite: vi.fn(),
  declineInvite: vi.fn(),
}));

function mockAuth(userOverrides?: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, createdAt: "2024-01-01T00:00:00Z" },
    accessToken: "token",
    refreshToken: "rt",
    isLoading: false,
    isAuthenticated: true,
    loginSuccess: vi.fn(),
    setUser: vi.fn(),
    logout: vi.fn(),
    ...userOverrides,
  } as ReturnType<typeof useAuth>);
}

describe("DashboardPage — display name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaces).mockResolvedValue([]);
    vi.mocked(getPendingInvites).mockResolvedValue([]);
    vi.mocked(listArchivedWorkspaces).mockResolvedValue([]);
  });

  it("renders display name input", async () => {
    mockAuth();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Your display name/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument();
  });

  it("shows current displayName if present", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: "Alice", createdAt: "2024-01-01T00:00:00Z" },
    });
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
    });
  });

  it("submits displayName update and shows success", async () => {
    const setUserMock = vi.fn();
    mockAuth({ setUser: setUserMock });
    vi.mocked(updateDisplayName).mockResolvedValueOnce({
      id: "u1",
      email: "a@b.com",
      username: "alice",
      displayName: "Alice",
      createdAt: "2024-01-01T00:00:00Z",
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Your display name/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Your display name/i), "Alice");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(updateDisplayName).toHaveBeenCalledWith("token", "Alice");
    });
    expect(setUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Alice" }),
    );
    expect(screen.getByText(/Display name updated/i)).toBeInTheDocument();
  });

  it("shows error on update failure", async () => {
    mockAuth();
    vi.mocked(updateDisplayName).mockRejectedValueOnce(new Error("Too long"));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Your display name/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText(/Your display name/i), "a".repeat(81));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    expect(await screen.findByText(/Too long/i)).toBeInTheDocument();
  });
});

describe("DashboardPage — workspace list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPendingInvites).mockResolvedValue([]);
    vi.mocked(listArchivedWorkspaces).mockResolvedValue([]);
  });

  it("shows Archive button for owned workspace", async () => {
    mockAuth({ user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, createdAt: "2024-01-01T00:00:00Z" } });
    vi.mocked(getWorkspaces).mockResolvedValue([
      { id: "ws1", name: "Owned", slug: "owned", description: null, ownerId: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: null },
    ]);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Owned")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Archive/i })).toBeInTheDocument();
  });

  it("hides Archive button for workspace where user is not owner", async () => {
    mockAuth({ user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, createdAt: "2024-01-01T00:00:00Z" } });
    vi.mocked(getWorkspaces).mockResolvedValue([
      { id: "ws1", name: "Member Of", slug: "member-of", description: null, ownerId: "u2", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: null },
    ]);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Member Of")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Archive/i })).not.toBeInTheDocument();
  });

  it("archives owned workspace on confirm", async () => {
    mockAuth({ user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, createdAt: "2024-01-01T00:00:00Z" } });
    vi.mocked(getWorkspaces).mockResolvedValue([
      { id: "ws1", name: "Owned", slug: "owned", description: null, ownerId: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", deletedAt: null },
    ]);
    vi.mocked(archiveWorkspace).mockResolvedValue({ success: true });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Archive/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Archive/i }));

    await waitFor(() => {
      expect(archiveWorkspace).toHaveBeenCalledWith("token", "ws1");
    });

    confirmSpy.mockRestore();
  });
});

describe("DashboardPage — pending invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaces).mockResolvedValue([]);
    vi.mocked(getPendingInvites).mockResolvedValue([]);
    vi.mocked(listArchivedWorkspaces).mockResolvedValue([]);
  });

  it("shows pending invites", async () => {
    mockAuth();
    vi.mocked(getPendingInvites).mockResolvedValue([
      {
        id: "invite-1",
        workspace: { id: "ws-1", name: "Test Workspace", slug: "test" },
        invitedBy: { id: "u2", username: "bob", displayName: "Bob" },
        role: "MEMBER",
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Test Workspace")).toBeInTheDocument();
    });
    expect(screen.getByText(/Invited by Bob · MEMBER/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Accept/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Decline/i })).toBeInTheDocument();
  });

  it("shows no pending invitations message when empty", async () => {
    mockAuth();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/No pending invitations/i)).toBeInTheDocument();
    });
  });

  it("accepts an invite and refreshes workspaces", async () => {
    mockAuth();
    vi.mocked(getPendingInvites).mockResolvedValue([
      {
        id: "invite-1",
        workspace: { id: "ws-1", name: "Test Workspace", slug: "test" },
        invitedBy: { id: "u2", username: "bob", displayName: null },
        role: "MEMBER",
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
    vi.mocked(acceptInvite).mockResolvedValue({ workspaceId: "ws-1", role: "MEMBER", joinedAt: new Date().toISOString() });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Accept/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Accept/i }));

    await waitFor(() => {
      expect(acceptInvite).toHaveBeenCalledWith("token", "invite-1");
    });
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
    dispatchSpy.mockRestore();
  });

  it("declines an invite after confirmation", async () => {
    mockAuth();
    vi.mocked(getPendingInvites).mockResolvedValue([
      {
        id: "invite-1",
        workspace: { id: "ws-1", name: "Test Workspace", slug: "test" },
        invitedBy: { id: "u2", username: "bob", displayName: null },
        role: "MEMBER",
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
    vi.mocked(declineInvite).mockResolvedValue({ id: "invite-1", deletedAt: new Date().toISOString() });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Decline/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Decline/i }));

    await waitFor(() => {
      expect(declineInvite).toHaveBeenCalledWith("token", "invite-1");
    });
    confirmSpy.mockRestore();
  });

  it("shows error when accepting invite fails", async () => {
    mockAuth();
    vi.mocked(getPendingInvites).mockResolvedValue([
      {
        id: "invite-1",
        workspace: { id: "ws-1", name: "Test Workspace", slug: "test" },
        invitedBy: { id: "u2", username: "bob", displayName: null },
        role: "MEMBER",
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
    vi.mocked(acceptInvite).mockRejectedValue(new Error("Invite expired"));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Accept/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Accept/i }));

    expect(await screen.findByText(/Invite expired/i)).toBeInTheDocument();
  });
});

describe("DashboardPage — archived workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaces).mockResolvedValue([]);
    vi.mocked(getPendingInvites).mockResolvedValue([]);
  });

  it("shows archived workspaces list", async () => {
    mockAuth();
    vi.mocked(listArchivedWorkspaces).mockResolvedValue([
      { id: "ws-arch", name: "Old Project", slug: "old", description: null, ownerId: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z", deletedAt: "2024-06-01T00:00:00Z" },
    ]);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Old Project")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Restore/i })).toBeInTheDocument();
  });

  it("shows no archived workspaces message when empty", async () => {
    mockAuth();
    vi.mocked(listArchivedWorkspaces).mockResolvedValue([]);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/No archived workspaces/i)).toBeInTheDocument();
    });
  });

  it("restores archived workspace on confirm", async () => {
    mockAuth();
    vi.mocked(listArchivedWorkspaces).mockResolvedValue([
      { id: "ws-arch", name: "Old Project", slug: "old", description: null, ownerId: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z", deletedAt: "2024-06-01T00:00:00Z" },
    ]);
    vi.mocked(restoreWorkspace).mockResolvedValue(
      { id: "ws-arch", name: "Old Project", slug: "old", description: null, ownerId: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z", deletedAt: null },
    );
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Restore/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Restore/i }));

    await waitFor(() => {
      expect(restoreWorkspace).toHaveBeenCalledWith("token", "ws-arch");
    });
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));

    confirmSpy.mockRestore();
    dispatchSpy.mockRestore();
  });

  it("shows error when restore fails", async () => {
    mockAuth();
    vi.mocked(listArchivedWorkspaces).mockResolvedValue([
      { id: "ws-arch", name: "Old Project", slug: "old", description: null, ownerId: "u1", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-06-01T00:00:00Z", deletedAt: "2024-06-01T00:00:00Z" },
    ]);
    vi.mocked(restoreWorkspace).mockRejectedValue(new Error("Workspace is not archived"));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Restore/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /Restore/i }));

    expect(await screen.findByText(/Workspace is not archived/i)).toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
