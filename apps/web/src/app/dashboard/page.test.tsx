import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import DashboardPage from "./page";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaces, archiveWorkspace, listArchivedWorkspaces, restoreWorkspace } from "@/lib/workspaces-api";
import { getPendingInvites, acceptInvite, declineInvite } from "@/lib/invites-api";
import { getPendingChannelInvites, acceptChannelInvite, declineChannelInvite } from "@/lib/channel-invites-api";

const routerPushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

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

vi.mock("@/lib/invites-api", () => ({
  getPendingInvites: vi.fn(),
  acceptInvite: vi.fn(),
  declineInvite: vi.fn(),
}));

vi.mock("@/lib/channel-invites-api", () => ({
  getPendingChannelInvites: vi.fn(),
  acceptChannelInvite: vi.fn(),
  declineChannelInvite: vi.fn(),
}));

function mockAuth(userOverrides?: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
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

describe("DashboardPage — profile link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaces).mockResolvedValue([]);
    vi.mocked(getPendingInvites).mockResolvedValue([]);
    vi.mocked(getPendingChannelInvites).mockResolvedValue([]);
    vi.mocked(listArchivedWorkspaces).mockResolvedValue([]);
  });

  it("renders a link to Profile settings", async () => {
    mockAuth();
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Welcome, alice/i)).toBeInTheDocument();
    });

    const link = screen.getByRole("link", { name: /Profile settings/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/profile");
  });
});

describe("DashboardPage — user identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaces).mockResolvedValue([]);
    vi.mocked(getPendingInvites).mockResolvedValue([]);
    vi.mocked(getPendingChannelInvites).mockResolvedValue([]);
    vi.mocked(listArchivedWorkspaces).mockResolvedValue([]);
  });

  it("shows displayName instead of username when displayName exists", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: "Alice", avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
    });
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Welcome, Alice/i)).toBeInTheDocument();
    });
  });

  it("falls back to username when displayName is null", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
    });
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Welcome, alice/i)).toBeInTheDocument();
    });
  });

  it("shows avatar image when avatarUrl exists", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: "/uploads/avatars/u1/test.png", avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
    });
    const { container } = render(<DashboardPage />);

    await waitFor(() => {
      expect(container.querySelector('img[src="/uploads/avatars/u1/test.png"]')).toBeInTheDocument();
    });
  });

  it("shows fallback initials when avatarUrl is null", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
    });
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("AL")).toBeInTheDocument();
    });
  });

  it("does not render spoken language chips", async () => {
    mockAuth({
      user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, createdAt: "2024-01-01T00:00:00Z" },
    });
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Welcome, alice/i)).toBeInTheDocument();
    });

    expect(screen.queryByText("English")).not.toBeInTheDocument();
    expect(screen.queryByText("Ukrainian")).not.toBeInTheDocument();
  });
});

describe("DashboardPage — workspace list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPendingInvites).mockResolvedValue([]);
    vi.mocked(getPendingChannelInvites).mockResolvedValue([]);
    vi.mocked(listArchivedWorkspaces).mockResolvedValue([]);
  });

  it("shows Archive button for owned workspace", async () => {
    mockAuth({ user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, languages: [], createdAt: "2024-01-01T00:00:00Z" } });
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
    mockAuth({ user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, languages: [], createdAt: "2024-01-01T00:00:00Z" } });
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
    mockAuth({ user: { id: "u1", email: "a@b.com", username: "alice", displayName: null, avatarUrl: null, avatarUpdatedAt: null, languages: [], createdAt: "2024-01-01T00:00:00Z" } });
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
    vi.mocked(getPendingChannelInvites).mockResolvedValue([]);
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
    expect(screen.getByText(/Invited by Bob/i)).toBeInTheDocument();
    expect(screen.getByText(/You will join as MEMBER/i)).toBeInTheDocument();
    expect(screen.queryByText(/Invited by Bob · MEMBER/i)).not.toBeInTheDocument();
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

  it("accepts an invite and redirects to workspace", async () => {
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
    expect(routerPushMock).toHaveBeenCalledWith("/workspaces/ws-1");
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

  it("shows 'You will join as ADMIN' for ADMIN invite", async () => {
    mockAuth();
    vi.mocked(getPendingInvites).mockResolvedValue([
      {
        id: "invite-1",
        workspace: { id: "ws-1", name: "Test Workspace", slug: "test" },
        invitedBy: { id: "u2", username: "bob", displayName: "Bob" },
        role: "ADMIN",
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Invited by Bob/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/You will join as ADMIN/i)).toBeInTheDocument();
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

describe("DashboardPage — pending channel invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaces).mockResolvedValue([]);
    vi.mocked(getPendingInvites).mockResolvedValue([]);
    vi.mocked(getPendingChannelInvites).mockResolvedValue([]);
    vi.mocked(listArchivedWorkspaces).mockResolvedValue([]);
  });

  it("shows pending channel invites", async () => {
    mockAuth();
    vi.mocked(getPendingChannelInvites).mockResolvedValue([
      {
        id: "ch-invite-1",
        role: "MEMBER",
        workspace: { id: "ws-1", name: "Test Workspace", slug: "test" },
        channel: { id: "ch-1", name: "general", slug: "general" },
        invitedBy: { id: "u2", username: "bob", displayName: "Bob" },
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Test Workspace")).toBeInTheDocument();
    });
    expect(screen.getByText("general")).toBeInTheDocument();
    expect(screen.getByText(/Invited by Bob/i)).toBeInTheDocument();
    expect(screen.getByText(/You will join as MEMBER/i)).toBeInTheDocument();
  });

  it("shows workspace name and channel name", async () => {
    mockAuth();
    vi.mocked(getPendingChannelInvites).mockResolvedValue([
      {
        id: "ch-invite-1",
        role: "MEMBER",
        workspace: { id: "ws-1", name: "Acme Corp", slug: "acme" },
        channel: { id: "ch-1", name: "random", slug: "random" },
        invitedBy: { id: "u2", username: "bob", displayName: null },
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    });
    expect(screen.getByText("random")).toBeInTheDocument();
  });

  it("shows inviter separately from role", async () => {
    mockAuth();
    vi.mocked(getPendingChannelInvites).mockResolvedValue([
      {
        id: "ch-invite-1",
        role: "MEMBER",
        workspace: { id: "ws-1", name: "Test", slug: "test" },
        channel: { id: "ch-1", name: "general", slug: "general" },
        invitedBy: { id: "u2", username: "bob", displayName: "Bob" },
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Invited by Bob/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/You will join as MEMBER/i)).toBeInTheDocument();
  });

  it("shows 'You will join as MEMBER'", async () => {
    mockAuth();
    vi.mocked(getPendingChannelInvites).mockResolvedValue([
      {
        id: "ch-invite-1",
        role: "MEMBER",
        workspace: { id: "ws-1", name: "Test", slug: "test" },
        channel: { id: "ch-1", name: "general", slug: "general" },
        invitedBy: { id: "u2", username: "bob", displayName: null },
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/You will join as MEMBER/i)).toBeInTheDocument();
    });
  });

  it("shows 'You will join as ADMIN' for ADMIN invite", async () => {
    mockAuth();
    vi.mocked(getPendingChannelInvites).mockResolvedValue([
      {
        id: "ch-invite-1",
        role: "ADMIN",
        workspace: { id: "ws-1", name: "Test", slug: "test" },
        channel: { id: "ch-1", name: "general", slug: "general" },
        invitedBy: { id: "u2", username: "bob", displayName: "Bob" },
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/You will join as ADMIN/i)).toBeInTheDocument();
    });
  });

  it("accept calls acceptChannelInvite", async () => {
    mockAuth();
    vi.mocked(getPendingChannelInvites).mockResolvedValue([
      {
        id: "ch-invite-1",
        role: "MEMBER",
        workspace: { id: "ws-1", name: "Test", slug: "test" },
        channel: { id: "ch-1", name: "general", slug: "general" },
        invitedBy: { id: "u2", username: "bob", displayName: null },
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
    vi.mocked(acceptChannelInvite).mockResolvedValue({ channelId: "ch-1", workspaceId: "ws-1", role: "MEMBER", joinedAt: new Date().toISOString() });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Accept/i }).length).toBeGreaterThanOrEqual(1);
    });

    const acceptButtons = screen.getAllByRole("button", { name: /Accept/i });
    await userEvent.click(acceptButtons[acceptButtons.length - 1]);

    await waitFor(() => {
      expect(acceptChannelInvite).toHaveBeenCalledWith("token", "ch-invite-1");
    });
  });

  it("successful accept dispatches channels:changed", async () => {
    mockAuth();
    vi.mocked(getPendingChannelInvites).mockResolvedValue([
      {
        id: "ch-invite-1",
        role: "MEMBER",
        workspace: { id: "ws-1", name: "Test", slug: "test" },
        channel: { id: "ch-1", name: "general", slug: "general" },
        invitedBy: { id: "u2", username: "bob", displayName: null },
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
    vi.mocked(acceptChannelInvite).mockResolvedValue({ channelId: "ch-1", workspaceId: "ws-1", role: "MEMBER", joinedAt: new Date().toISOString() });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Accept/i }).length).toBeGreaterThanOrEqual(1);
    });

    const acceptButtons = screen.getAllByRole("button", { name: /Accept/i });
    await userEvent.click(acceptButtons[acceptButtons.length - 1]);

    await waitFor(() => {
      expect(acceptChannelInvite).toHaveBeenCalledWith("token", "ch-invite-1");
    });
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
    const dispatchedEvents = dispatchSpy.mock.calls.map((call) => (call[0] as Event).type);
    expect(dispatchedEvents).toContain("channels:changed");

    dispatchSpy.mockRestore();
  });

  it("successful accept redirects to /workspaces/ws-1/channels/ch-1", async () => {
    mockAuth();
    vi.mocked(getPendingChannelInvites).mockResolvedValue([
      {
        id: "ch-invite-1",
        role: "MEMBER",
        workspace: { id: "ws-1", name: "Test", slug: "test" },
        channel: { id: "ch-1", name: "general", slug: "general" },
        invitedBy: { id: "u2", username: "bob", displayName: null },
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
    vi.mocked(acceptChannelInvite).mockResolvedValue({ channelId: "ch-1", workspaceId: "ws-1", role: "MEMBER", joinedAt: new Date().toISOString() });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Accept/i }).length).toBeGreaterThanOrEqual(1);
    });

    const acceptButtons = screen.getAllByRole("button", { name: /Accept/i });
    await userEvent.click(acceptButtons[acceptButtons.length - 1]);

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/workspaces/ws-1/channels/ch-1");
    });
  });

  it("accept error shows inline error and does not redirect", async () => {
    mockAuth();
    vi.mocked(getPendingChannelInvites).mockResolvedValue([
      {
        id: "ch-invite-1",
        role: "MEMBER",
        workspace: { id: "ws-1", name: "Test", slug: "test" },
        channel: { id: "ch-1", name: "general", slug: "general" },
        invitedBy: { id: "u2", username: "bob", displayName: null },
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
    vi.mocked(acceptChannelInvite).mockRejectedValue(new Error("Invite expired"));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Accept/i }).length).toBeGreaterThanOrEqual(1);
    });

    const acceptButtons = screen.getAllByRole("button", { name: /Accept/i });
    await userEvent.click(acceptButtons[acceptButtons.length - 1]);

    expect(await screen.findByText(/Invite expired/i)).toBeInTheDocument();
    expect(routerPushMock).not.toHaveBeenCalledWith("/workspaces/ws-1/channels/ch-1");
  });

  it("decline calls declineChannelInvite", async () => {
    mockAuth();
    vi.mocked(getPendingChannelInvites).mockResolvedValue([
      {
        id: "ch-invite-1",
        role: "MEMBER",
        workspace: { id: "ws-1", name: "Test", slug: "test" },
        channel: { id: "ch-1", name: "general", slug: "general" },
        invitedBy: { id: "u2", username: "bob", displayName: null },
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
    vi.mocked(declineChannelInvite).mockResolvedValue({ id: "ch-invite-1", deletedAt: new Date().toISOString() });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Decline/i }).length).toBeGreaterThanOrEqual(1);
    });

    const declineButtons = screen.getAllByRole("button", { name: /Decline/i });
    await userEvent.click(declineButtons[declineButtons.length - 1]);

    await waitFor(() => {
      expect(declineChannelInvite).toHaveBeenCalledWith("token", "ch-invite-1");
    });

    confirmSpy.mockRestore();
  });

  it("successful decline removes invite and does not redirect", async () => {
    mockAuth();
    vi.mocked(getPendingChannelInvites).mockResolvedValue([
      {
        id: "ch-invite-1",
        role: "MEMBER",
        workspace: { id: "ws-1", name: "Test", slug: "test" },
        channel: { id: "ch-1", name: "general", slug: "general" },
        invitedBy: { id: "u2", username: "bob", displayName: null },
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
    vi.mocked(declineChannelInvite).mockResolvedValue({ id: "ch-invite-1", deletedAt: new Date().toISOString() });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("general")).toBeInTheDocument();
    });

    const declineButtons = screen.getAllByRole("button", { name: /Decline/i });
    await userEvent.click(declineButtons[declineButtons.length - 1]);

    await waitFor(() => {
      expect(declineChannelInvite).toHaveBeenCalledWith("token", "ch-invite-1");
    });
    expect(routerPushMock).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("shows empty state 'No pending channel invitations.'", async () => {
    mockAuth();

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/No pending channel invitations/i)).toBeInTheDocument();
    });
  });
});

describe("DashboardPage — archived workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaces).mockResolvedValue([]);
    vi.mocked(getPendingInvites).mockResolvedValue([]);
    vi.mocked(getPendingChannelInvites).mockResolvedValue([]);
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
